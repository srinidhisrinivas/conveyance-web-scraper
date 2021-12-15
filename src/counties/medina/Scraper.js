const InfoParser = require('../../InfoParser.js');
const puppeteer = require('puppeteer');
const ConfigReader = require('../../ConfigReader.js');
const ErrorLogger = require("../../ErrorLogger.js");

const ERROR_LOGGER = new ErrorLogger('medina');
const CONFIG = new ConfigReader('medina');

let Scraper = function(){
	this.getTableDataBySelector = async function(page, selector, html){
		if(html){
			return await page.$$eval(selector, rows => {
			  return Array.from(rows, row => {
			    const columns = row.querySelectorAll('th, td');
			    const datum = Array.from(columns, column => column.outerHTML);
			    return datum;
				  });

			});
		} else {
			return await page.$$eval(selector, rows => {
			  return Array.from(rows, row => {
			    const columns = row.querySelectorAll('th, td');
			    const datum = Array.from(columns, column => column.innerText);
			    return datum;
				  });

			});
		}

		
	}

	this.getInfoFromTableByRowHeader = async function(table, header, delimiter){
		let inTargetHeader = false;
		let info = '';
		for(let i = 0; i < table.length; i++){
			let row = table[i];
			let rowHeader = row[0].trim();
			if(inTargetHeader){
				if(rowHeader === ''){
					info += delimiter + ' ' + row[row.length - 1];
				} else {
					inTargetHeader = false;
					break;
				}
			} 
			else if(rowHeader === header){
				inTargetHeader = true;
				info += row[row.length-1];
			} 
		}
		return info;
	}
	this.getInfoFromTableByColumnHeader = async function(table, header, rowNum){
		let headers = table.shift();
		// console.log(headers);
		// console.log(header);
		let colIndex = headers.indexOf(header);
		if(colIndex > 0){
			return table[rowNum][colIndex];
		} else {
			return 'ERR'
		}
	}


	this.processHyperLinks = async function(page, hyperlinks, infoValidator){
		let processedInformation = [];
		let infoParser = new InfoParser();
		for(let i = 0; i < hyperlinks.length; i++){
			// if(i > 130) break;
			let pageLink = hyperlinks[i];
			console.log(pageLink);

			let visitAttemptCount;
			for(visitAttemptCount = 0; visitAttemptCount < CONFIG.DEV_CONFIG.MAX_VISIT_ATTEMPTS; visitAttemptCount++){
				try{
					await page.goto(CONFIG.DEV_CONFIG.AUDITOR_PARCEL_URL);
					await page.waitForSelector("input#parcel");
					await page.click('input#parcel', {clickCount: 3});					
					await page.type('input#parcel', pageLink);
					await page.waitFor(200);

					
					await page.keyboard.press('Enter');
					
					await page.waitForSelector('table.results a', {timeout: CONFIG.DEV_CONFIG.PARCEL_TIMEOUT_MSEC});
					await page.waitFor(200);

					await page.click("#results td a");
					await page.waitFor(200);

					await page.waitForSelector(".col-md-8 table.table", {timeout: CONFIG.DEV_CONFIG.PARCEL_TIMEOUT_MSEC});
					await page.waitFor(200);
					
					const ownerTableData = await this.getTableDataBySelector(page, "table.table tr",false);
					
					if(ownerTableData.length < 1){
						throw "Owner Table Not Found";
					}
					
				}
				catch(e){
					console.log(e);
					console.log('Unable to visit ' + pageLink + '. Attempt #' + visitAttemptCount);
					continue;
				}
				break;	
			}

			if(visitAttemptCount === CONFIG.DEV_CONFIG.MAX_VISIT_ATTEMPTS){
				console.log('Failed to reach ' + pageLink + '. Giving up.');
				let remainingLinks = hyperlinks.slice(i);
				return {
					code: CONFIG.DEV_CONFIG.PAGE_ACCESS_ERROR_CODE,
					remaining_links: remainingLinks,
					processed_information: processedInformation
				};
			}
			
			// await page.waitForSelector("div.col-md-8 table.table")
			// console.log('found selector')
			let ownerTableData = await this.getTableDataBySelector(page, "table.table tr",false);
			// console.log(ownerTableData);
			
			let ownerNameRow = ownerTableData.filter(row => row.includes("Owner Name"))[0];
			let ownerNames = ownerNameRow[1];
			ownerNames = infoParser.parseOwnerNames(ownerNames);

			let ownerAddressRow = ownerTableData.filter(row => row.some(el => el.includes("Mailing Address")))[0];
			let ownerAddress = ownerAddressRow[1].split('\n');
			ownerAddress.shift();
			// Get rid of 'USA' at end, if present
			addressLastLine = ownerAddress[ownerAddress.length-1]
			addressLastLine = addressLastLine.split(', ').join(' ')
			lastLineEls = addressLastLine.split(' ');
			if(isNaN(lastLineEls[lastLineEls.length-1])){
				lastLineEls.pop();
			}
			addressLastLine = lastLineEls.join(' ');
			ownerAddress[ownerAddress.length-1] = addressLastLine;
			ownerAddress = ownerAddress.join(", ")
			//ownerData.join(', ');
			
			ownerAddress = infoParser.parseAddress(ownerAddress);

			let marketValueData = ownerTableData.filter(row => row.includes('Total Value'))[0];
			let marketValue;
			if(marketValueData) {
				marketValue = marketValueData[1];
				marketValue = parseInt(marketValue.replace(/[,\$]/g, ''));
			} else {
				console.log("Market Value not found, skipping.");
				continue;
			}
			
			for(visitAttemptCount = 0; visitAttemptCount < CONFIG.DEV_CONFIG.MAX_VISIT_ATTEMPTS; visitAttemptCount++){
				try{
					let transferTag;
					let sideMenu = await page.$$("p.links > a");
					//console.log(sideMenu);
					for(let i = 0; i < sideMenu.length; i++){
						handle = sideMenu[i];
						let prop = await handle.getProperty('innerText');
						let propJSON = await prop.jsonValue();
						// console.log(propJSON);
						if(propJSON.includes('Transfers')) transferTag = handle;
					}
					await transferTag.click();
					await page.waitForSelector("table", {timeout: CONFIG.DEV_CONFIG.PARCEL_TIMEOUT_MSEC});
				}
				catch(e){
					console.log(e);
					console.log('Unable to visit transfers. Attempt #' + visitAttemptCount);
					await page.goto(propertyURL);

					continue;
				}
				break;	
			}
			if(visitAttemptCount === CONFIG.DEV_CONFIG.MAX_VISIT_ATTEMPTS){
				console.log('Failed to reach transfers. Giving up.');
				continue;
				
			} 
			let transferTableData = await this.getTableDataBySelector(page, "table tr", false);
			// console.log(transferTableData)
			transferTableData.shift();
			
			let dates = transferTableData.map(row => new Date(row[0].split('\n')[0]));
			
			// Exclude Invalid Dates ("Unknown" on website)
			let excludeDatesIdx = [];
			for(let i = 0; i < dates.length; i++){
				if(!(Object.prototype.toString.call(dates[i]) === '[object Date]' && isFinite(dates[i]))){
					excludeDatesIdx.push(i)
				}
			}
			for(let i = 0; i < excludeDatesIdx.length; i++){
				dates.splice(excludeDatesIdx[i],1);
				transferTableData.splice(excludeDatesIdx[i],1);
			}

			let maxDateIdx = 0;
			for(let i = 1; i < dates.length; i++){
				let currDate = dates[i];
				if(currDate >= dates[maxDateIdx]){
					maxDateIdx = i;
				}
			}
			
			let latestTransferData = transferTableData[maxDateIdx];
			let transferAmount = '';
			if(latestTransferData !== undefined){

				transferAmount = latestTransferData[latestTransferData.length - 1].split('\n')[0];
			} 

			if(transferAmount.trim() !== '') transferAmount = parseInt(transferAmount.replace(/[,\$]/g, ''));
			else transferAmount = undefined;

			// console.log(transferAmount);

			let currentInfo = {
				owner: ownerNames,
				street: ownerAddress.street,
				city: ownerAddress.city,
				state: ownerAddress.state,
				zip: ownerAddress.zip,
				transfer: transferAmount,
				value: marketValue
			};
			// console.log(currentInfo)
			if(!infoValidator(currentInfo, processedInformation)){
				console.log('Value Validation Failed');
				continue;
			}

			processedInformation.push(currentInfo);

			console.log(processedInformation[processedInformation.length - 1]);

			// console.log('Parcel ID: ' + parcelID);
			// console.log('Owner: ' + ownerNames);
			// console.log('Owner Address: ' + ownerAddress);
			// console.log('Transfer Price: ' + transferAmount);
			// console.log('Market Value: ' + marketValue);
			// console.log('\n')
			
		}
		return processedInformation;
	}

	this.getParcelIDsForDateRange = async function(page, start, end){

		await page.goto(CONFIG.DEV_CONFIG.AUDITOR_ADVANCED_URL);
		
		await page.waitForSelector("input#daterange", {timeout: CONFIG.DEV_CONFIG.SEARCH_TIMEOUT_MSEC})
		await page.waitFor(200);

		await page.type("input#daterange", start+" - "+end);
		await page.waitFor(200);
		await page.keyboard.press('Tab');

		await page.type("input#transfersOver", '50000');
		await page.waitFor(200);		
		
		await page.type("input#transfersUnder", '10000000');
		await page.waitFor(200);		

		await page.keyboard.press('Enter');
		await page.waitFor(200);

		await page.waitForSelector("table#tranferResults", {timeout: CONFIG.DEV_CONFIG.SEARCH_TIMEOUT_MSEC});
		await page.waitFor(200);
		
		let allHyperlinks = [];
		let pageNum=1;	


		let resultTableData = await this.getTableDataBySelector(page, "table#tranferResults tr",false);
		
		resultTableData.shift();
		resultTableData = resultTableData.map(row => row[0].split('\n'));
		resultTableData = resultTableData.filter(row => row.length > 1);
		resultTableData = resultTableData.map(row => row[1]);


		allHyperlinks = resultTableData;
		
		console.log(allHyperlinks);
		
		return allHyperlinks;
	}

}

module.exports = Scraper

function infoValidator(info, processedInformation){
	let valid = false;
	if(info.transfer < info.value && info.transfer > 0) valid = true;
	if(processedInformation.some(e => e.owner === info.owner)) valid = false;	
	return valid;
	
}	
async function run(){
	const browser = await puppeteer.launch({headless: false});
	const page = await browser.newPage();
	const scrape = new Scraper();
	let allHyperlinks = await scrape.getParcelIDsForDateRange(page, '11/01/2021','11/05/2021');
 	/*
 	let allHyperlinks = [
	   '024-04B-21-019', '012-21A-07-177', '019-13D-31-002', '026-06C-13-102',
	  '033-12C-33-008', '031-11B-21-154', '038-17D-12-007', '013-14A-38-019',
	  '001-02D-30-026', '020-10D-28-005', '030-11A-02-099', '038-17A-16-067',
	  '040-20D-11-049', '003-18B-32-323', '041-15A-20-020', '016-03B-06-080',
	  '040-20B-14-036', '040-20A-21-047', '003-18A-04-197', '028-19B-14-074',
	  '040-20D-08-113'
	 ];
	*/
	let processedInformation = await scrape.processHyperLinks(page, allHyperlinks, infoValidator);
}

// run();
