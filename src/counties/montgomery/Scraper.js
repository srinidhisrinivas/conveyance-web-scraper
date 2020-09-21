const InfoParser = require('../../InfoParser.js');
const puppeteer = require('puppeteer');
const ConfigReader = require('../../ConfigReader.js');
const ErrorLogger = require("../../ErrorLogger.js");

const ERROR_LOGGER = new ErrorLogger('montgomery');
const CONFIG = new ConfigReader('montgomery');

let Scraper = function(){
	this.getTableDataBySelector = async function(page, selector, html){
		if(html){
			return await page.$$eval(selector, rows => {
			  return Array.from(rows, row => {
			    const columns = row.querySelectorAll('td');
			    const datum = Array.from(columns, column => column.outerHTML);
			    return datum;
				  });

			});
		} else {
			return await page.$$eval(selector, rows => {
			  return Array.from(rows, row => {
			    const columns = row.querySelectorAll('td');
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
					if(!row[row.length - 1].includes("LIEN") && !row[row.length - 1].includes("SOLD")) info += delimiter + ' ' + row[row.length - 1];
				} else {
					inTargetHeader = false;
					break;
				}
			} 
			else if(rowHeader.includes(header)){
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

					await page.waitForSelector("input#inpParid");
					await page.click('input#inpParid', {clickCount: 3});					
					await page.type('input#inpParid', pageLink);

					await page.select('#inpTaxyr', CONFIG.USER_CONFIG.TAX_YEAR);
					await page.waitFor(200);

					const searchButton = await page.$('button#btSearch');
					await searchButton.click();
					
					await page.waitForSelector('tr.SearchResults', {timeout: CONFIG.DEV_CONFIG.SEARCH_TIMEOUT_MSEC});
					await page.waitFor(200);

					await page.click("tr.SearchResults");
					await page.waitFor(200);

					await page.waitForSelector("table#Mailing", {timeout: CONFIG.DEV_CONFIG.PARCEL_TIMEOUT_MSEC});
					await page.waitFor(200);
					
					const ownerTableData = await this.getTableDataBySelector(page, "table#Mailing tr",false);
					
					if(ownerTableData.length < 1){
						throw "Owner Table Not Found";
					}
					
				}
				catch(e){
					// console.log(e);
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
			

			// const parcelIDString = (await (await (await page.$('.DataletHeaderTopLeft')).getProperty('innerText')).jsonValue());
			// const parcelID = parcelIDString.substring(parcelIDString.indexOf(':')+2);
			
			const mailingTableData = await this.getTableDataBySelector(page, "table#Mailing tr",false);
			let ownerTableData = await this.getTableDataBySelector(page, "table#Owner tr", false);
			ownerTableData = ownerTableData.filter(row => row.some(e => e.length > 0));
			ownerTableData = ownerTableData.map(row => row[0]);
			
			// console.log('Owner Table Data:');
			// console.log(ownerTableData);
			let ownerNames = ownerTableData[ownerTableData.indexOf('Name') + 1];
			ownerNames = infoParser.parseOwnerNames(ownerNames);
			// console.log(ownerNames);

			let ownerAddress = await this.getInfoFromTableByRowHeader(mailingTableData, 'Mailing Address','');	
			let zipLine = await this.getInfoFromTableByRowHeader(mailingTableData, 'City, State, Zip','');
			zipLine = zipLine.replace(/,/g,'');
			zipLine = zipLine.replace(/(?<=[0-9])((\s)(?=[0-9]))/g,'-');
			ownerAddress += ',' + zipLine
			
			ownerAddress = infoParser.parseAddress(ownerAddress);
			
			if(ownerAddress.street === ''){
				let remainingLinks = hyperlinks.slice(i);
				return {
					code: CONFIG.DEV_CONFIG.PAGE_ACCESS_ERROR_CODE,
					remaining_links: remainingLinks,
					processed_information: processedInformation
				};
			}

			let saleTableData = await this.getTableDataBySelector(page, "table#Sales tr",false);
			saleTableData.shift();
			saleTableData.pop();
			
			let transferAmount = saleTableData[saleTableData.length - 1][1];
			
			let marketTableData = await this.getTableDataBySelector(page, "table#Values tr",false);
			marketTableData = marketTableData.filter(row => row.includes('Total'))[0];
			let marketValue = marketTableData[marketTableData.length - 1];
			
			
			transferAmount = parseInt(transferAmount.replace(/[,\$]/g, ''));
			marketValue = parseInt(marketValue.replace(/[,\$]/g, ''));

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

		let visitAttemptCount;
		for(visitAttemptCount = 0; visitAttemptCount < CONFIG.DEV_CONFIG.MAX_VISIT_ATTEMPTS; visitAttemptCount++){
			try{
				await page.goto(CONFIG.DEV_CONFIG.AUDITOR_ADVANCED_URL);
				await page.waitForSelector('select#sCriteria');
				await page.waitFor(200);

				await page.select('select#sCriteria', '9');
				await page.waitForSelector('input#ctl01_cal1_dateInput');
				await page.waitFor(200);

				await page.type('input#ctl01_cal1_dateInput', start);
				await page.type('input#ctl01_cal2_dateInput', end);

				await page.click('button#btAdd');
				await page.waitFor(200);

				await page.select('select#sCriteria', '10');
				await page.waitForSelector('input#txtCrit');
				await page.waitFor(200);

				await page.type('input#txtCrit', '50000');
				await page.type('input#txtCrit2', '10000000');

				await page.click('button#btAdd');
				await page.waitFor(200);

				await page.select('select#selPageSize','25');
				await page.waitFor(200);

				await page.select('#inpTaxyr', CONFIG.USER_CONFIG.TAX_YEAR);
				await page.waitFor(200);


				//await page.screenshot({path: 'screenshot1.png'});
				await page.evaluate(() => {
					document.querySelector("button#btSearch").click();
				});
				
				await page.waitForSelector("table#searchResults", {timeout: CONFIG.DEV_CONFIG.SEARCH_TIMEOUT_MSEC});
				//await page.screenshot({path: 'screenshot2.png'});
			} catch(e){
				// console.log(e);
				console.log('Unable to visit auditor page. Attempt #' + visitAttemptCount);
				continue;
			}
			
			break;	
		}

		if(visitAttemptCount === CONFIG.DEV_CONFIG.MAX_VISIT_ATTEMPTS){
			console.log('Failed to reach auditor link. Giving up.');
			let remainingLinks = hyperlinks.slice(i);
			return {
				code: CONFIG.DEV_CONFIG.PAGE_ACCESS_ERROR_CODE,
				remaining_links: remainingLinks,
				processed_information: processedInformation
			};
		}


		let allHyperlinks = [];
		let pageNum=1;	
		

		while(true){
			await page.waitForSelector('table#searchResults tr');
	  		await page.waitFor(200);
			let resultTableData = await this.getTableDataBySelector(page, "table#searchResults tr",false);

			if(!resultTableData) continue;
			resultTableData.shift();	
			resultTableData.shift();

			resultTableData = resultTableData.filter(row => {
				transferAmount = row[row.length-2].replace(/[,\$]/g, ''); 
				
				return transferAmount !== "0";
			});
			resultTableData = resultTableData.map(row => row[0]);
			hyperlinks = resultTableData;
			console.log('Page num '+pageNum);
			console.log(hyperlinks);

			if(hyperlinks === undefined){
				break;
			} else {
				console.log('Number of results on this page: ' + hyperlinks.length);
				allHyperlinks = allHyperlinks.concat(hyperlinks);
			}
			pageNum++;

			let links = await page.$$("tbody a");
			let nextButton;
			for(let i = 0; i < links.length; i++){
				handle = links[i];
				let prop = await handle.getProperty('innerText');
				let propJSON = await prop.jsonValue();
				// console.log(propJSON);
				if(propJSON.includes('Next')) nextButton = handle;
			}
			if(nextButton === undefined) break;

			await nextButton.click();

		}
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
	let allHyperlinks = await scrape.getParcelIDsForDateRange(page, 'JAN/01/2020','JAN/02/2020');
	// let allHyperlinks = [
 //  'A01 00101 0003','I39300219 0002', 'O68 01822 0012', 'R72 13907 0051'];
	let processedInformation = await scrape.processHyperLinks(page, allHyperlinks, infoValidator);
}

// run();
