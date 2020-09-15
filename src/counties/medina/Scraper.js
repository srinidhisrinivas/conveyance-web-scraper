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

					await page.click("table.results a");
					await page.waitFor(200);

					await page.waitForSelector("table.table", {timeout: CONFIG.DEV_CONFIG.PARCEL_TIMEOUT_MSEC});
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
			

			let ownerTableData = await this.getTableDataBySelector(page, "table.table tr",false);
			let ownerData = ownerTableData.slice(1, 4);
			ownerData = ownerData.filter(row => row.length > 1);
			ownerData = ownerData.map(row => row[1]);

			let ownerNames = ownerData.shift();
			ownerNames = infoParser.parseOwnerNames(ownerNames);
			// console.log(ownerNames);

			for(let i = 0; i < ownerData.length; i++){
				ownerData[i] = ownerData[i].replace(/,/g,'');
			}
			// console.log(ownerData);
			let ownerAddress = ownerData.join(', ');
			ownerAddress = infoParser.parseAddress(ownerAddress);
			// console.log(ownerAddress);

			// console.log(ownerTableData);
			let marketValueData = ownerTableData.filter(row => row.includes('Total Value'))[0];
			let marketValue;
			if(marketValueData) {
				marketValue = marketValueData[1];
				marketValue = parseInt(marketValue.replace(/[,\$]/g, ''));
			} else {
				console.log("Market Value not found, skipping.");
				continue;
			}
			
			// console.log(marketValue);
			
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
			transferTableData.shift();
			
			let dates = transferTableData.map(row => new Date(row[0].split('\n')[0]));
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
	const browser = await puppeteer.launch({headless: false, slowMo: 5});
	const page = await browser.newPage();
	const scrape = new Scraper();
	let allHyperlinks = await scrape.getParcelIDsForDateRange(page, '01/01/2020','01/05/2020');
// 	let allHyperlinks = [
//   '10012145', '105676',
//   '113194',   '1308489',
//   '1400625',  '3603335',
//   '3605658',  '616491',
//   '616493'
// ];

	let processedInformation = await scrape.processHyperLinks(page, allHyperlinks, infoValidator);
}

// run();
