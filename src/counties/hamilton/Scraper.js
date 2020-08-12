const InfoParser = require('../../InfoParser.js');
const puppeteer = require('puppeteer');
const ConfigReader = require('../../ConfigReader.js');
const ErrorLogger = require("../../ErrorLogger.js");

const ERROR_LOGGER = new ErrorLogger('hamilton');
const CONFIG = new ConfigReader('hamilton');

const auditorAddress = CONFIG.DEV_CONFIG.AUDITOR_TARGET_URL;

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
					await page.goto(auditorAddress);
					await page.waitForSelector('input#search_radio_parcel_id');

					const parcelButton = await page.$('input#search_radio_parcel_id');
					parcelButton.click();

					await page.waitForSelector('div#number-criteria');

					await page.click('input#parcel_number', {clickCount: 3});					

					await page.type("input#parcel_number", pageLink);
					await page.evaluate(() => {
						document.querySelector("form#search_by_parcel_id button[type='submit']").click();
					});


					await page.waitForSelector("table#property_information", {timeout: CONFIG.DEV_CONFIG.PARCEL_TIMEOUT_MSEC});
					await page.waitFor(200);

					const taxTableData = await this.getTableDataBySelector(page, "table#property_information",false);
					if(taxTableData.length < 1){
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
			

			// const parcelIDString = (await (await (await page.$('.DataletHeaderTopLeft')).getProperty('innerText')).jsonValue());
			// const parcelID = parcelIDString.substring(parcelIDString.indexOf(':')+2);
			
			let ownerTableData = await this.getTableDataBySelector(page, "table#property_information",false);
			ownerTableData = ownerTableData[0];
			ownerTableData = ownerTableData.filter(el => el.includes("Owner"));
			ownerTableData = ownerTableData[0].split('\n');
			ownerTableData.shift();
			ownerTableData.pop();
			console.log('Owner Table Data:');
			
			// console.log(ownerTableData);
			
			let ownerNames = ownerTableData[0];
			ownerNames = infoParser.parseOwnerNames(ownerNames);

			let ownerAddress = ownerTableData.slice(1).join(',');
			ownerAddress = ownerAddress.replace(/\n/g,',');
			ownerAddress = infoParser.parseAddress(ownerAddress);
			
			if(ownerAddress.street === ''){
				let remainingLinks = hyperlinks.slice(i);
				return {
					code: CONFIG.DEV_CONFIG.PAGE_ACCESS_ERROR_CODE,
					remaining_links: remainingLinks,
					processed_information: processedInformation
				};
			}

			let taxTableData = await this.getTableDataBySelector(page, "table#tax-credit-value-summary",false);
			taxTableData = taxTableData[0];
			let marketValue = taxTableData[taxTableData.indexOf("Market Total Value") + 1];
			console.log(marketValue);
			
			let propertyTable = await this.getTableDataBySelector(page, "table[summary='Appraisal Summary']", false); 
			propertyTable = propertyTable[0];
			let transferAmount = propertyTable[propertyTable.indexOf("Last Sale Amount") + 1];
			console.log(transferAmount);
			
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

		await page.goto(auditorAddress);
		await page.waitForSelector('input#search_radio_sales');

		const salesButton = await page.$('input#search_radio_sales');
		salesButton.click();

		await page.waitForSelector('div#sales-criteria');
		

		const from = await page.$('input#sale_date_low');
		await from.click();
		await page.waitFor(500);
		await page.type('input#sale_date_low', start, {delay:300});
		
		// const to = await page.$('input#sale_date_high');
		// await to.click();
		await page.keyboard.press("Tab");
		await page.keyboard.press("Backspace");

		await page.type('input#sale_date_high', end, {delay:300});
		await page.keyboard.press("Tab");
		
		await page.waitFor(500);

		await page.evaluate(() => {
			document.querySelector("div#sales-criteria button[type='submit']").click();
		});
		
		await page.waitForSelector("table#search-results", {timeout: 0});

		let allHyperlinks = [];
		let pageNum=1;	

		while(true){
	  		await page.waitFor(500);

			let resultTableData = await this.getTableDataBySelector(page, "table#search-results tr",false);
			
			if(!resultTableData) continue;
			resultTableData.shift();	

			resultTableData = resultTableData.filter(row => {
				transferAmount = row[row.length-1].replace(/[,\$]/g, ''); 
				
				return transferAmount !== "0";
			});
			resultTableData = resultTableData.map(row => row[0]);
					
			hyperlinks = resultTableData;
			console.log('Page num '+pageNum);
			console.log(hyperlinks);

			if(hyperlinks === undefined || hyperlinks.length == 0){
				break;
			} else {
				console.log('Number of results on this page: ' + hyperlinks.length);
				allHyperlinks = allHyperlinks.concat(hyperlinks);
			}
			pageNum++;

			const nextButton = await page.$('a#search-results_next');
			const nextClass = await page.$eval('a#search-results_next', e => e.getAttribute('class'));
			// console.log(nextClass);
			// console.log(await (await nextButton.getProperty('outerHTML')).jsonValue());
			if(nextClass.includes('disabled')) break;

			await nextButton.click();
			await page.waitFor(1500); // TODO: Wait for update to happen

		}
		console.log(allHyperlinks);
		
		return allHyperlinks;
	}

}

// async function ex(address){
// 	let scraper = new Scraper();
// 	const browser = await puppeteer.launch({headless: true});
// 	const page = await browser.newPage();

// 	await page.goto(address);
// 	await page.waitForSelector('table#ep538257');

// 	let tableData = await scraper.getTableDataBySelector(page, 'id','ep538257',false);
// 	tableData.shift();
// 	tableData.pop();
// 	tableData = tableData.filter(e => e[1].trim());
// 	tableData = tableData.map(e => [e[1].replace(/\*/g,''),e[0]]);
// 	let map = {};
// 	tableData.forEach(e => map[e[0]] = e[1]);
// 	const fs = require('fs');

// 	let w = fs.createWriteStream('unitabbreviations.json');
// 	w.write(JSON.stringify(map));
// 	w.close();
// 	console.log(map);
// }

// ex('https://pe.usps.com/text/pub28/28apc_003.htm');
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
	let allHyperlinks = await scrape.getParcelIDHyperlinksForDate(page);
	let processedInformation = await scrape.processHyperLinks(page, allHyperlinks, infoValidator);
}

// run();
