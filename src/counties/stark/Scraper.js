const InfoParser = require('../../InfoParser.js');
const puppeteer = require('puppeteer');
const ConfigReader = require('../../ConfigReader.js');
const ErrorLogger = require("../../ErrorLogger.js");

const ERROR_LOGGER = new ErrorLogger('stark');
const CONFIG = new ConfigReader('stark');

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
					await page.waitForSelector("button#btAgree", {timeout: CONFIG.DEV_CONFIG.ACK_TIMEOUT_MSEC});
					await page.waitFor(200);
					let ackButton = await page.$("button#btAgree");
					await ackButton.click();
					await page.waitFor(200);
					throw "Acknowledge Button Clicked";

				} catch(e){
					try{
						await page.waitForSelector("input#inpParid");
						await page.click('input#inpParid', {clickCount: 3});					
						await page.type('input#inpParid', pageLink);
						const searchButton = await page.$('button#btSearch');
						await searchButton.click();

						await page.waitForSelector('tr.SearchResults', {timeout: CONFIG.DEV_CONFIG.ACK_TIMEOUT_MSEC});
						await page.waitFor(200);

						await page.click("tr.SearchResults");
						await page.waitFor(200);

						throw "Parcel clicked";

					} catch(e){
						// console.log(e);
						try{

							await page.waitForSelector("table#Owner", {timeout: CONFIG.DEV_CONFIG.PARCEL_TIMEOUT_MSEC});
							await page.waitFor(200);
							
							const ownerTableData = await this.getTableDataBySelector(page, "table#Owner tr",false);
							
							if(ownerTableData.length < 1){
								throw "Owner Table Not Found";
							}
						} catch(e){
							console.log(e);
							console.log('Unable to visit ' + pageLink + '. Attempt #' + visitAttemptCount);
							continue;
						}
					}
						
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
			
			let thisURL = page.url();
			// const parcelIDString = (await (await (await page.$('.DataletHeaderTopLeft')).getProperty('innerText')).jsonValue());
			// const parcelID = parcelIDString.substring(parcelIDString.indexOf(':')+2);
			
			const ownerTableData = await this.getTableDataBySelector(page, "table#Owner tr",false);
			// console.log('Owner Table Data:');
			// console.log(ownerTableData);
			let ownerNames = await this.getInfoFromTableByRowHeader(ownerTableData, 'Owner 1', '');
			ownerNames = infoParser.parseOwnerNames(ownerNames);
			// console.log(ownerNames);

			let ownerAddress = await this.getInfoFromTableByRowHeader(ownerTableData, 'Address',',');
			// console.log(ownerAddress);	
			ownerAddress = infoParser.parseAddress(ownerAddress);

			// console.log(ownerAddress);
			// const parcelIDString = (await (await (await page.$('.DataletHeaderTopLeft')).getProperty('innerText')).jsonValue());
			// const parcelID = parcelIDString.substring(parcelIDString.indexOf(':')+2);
			const taxTableData = await this.getTableDataBySelector(page, "table[id*='Tax Mailing Name and Address'] tr", false);
			let taxName = await this.getInfoFromTableByRowHeader(taxTableData, 'Mailing Name 1', '');
			taxName = infoParser.parseOwnerNames(taxName);
			// console.log(taxName);

			let taxAddress = (await this.getInfoFromTableByRowHeader(taxTableData, 'Address 1', '')).trim();;
			taxAddress += ', ' + (await this.getInfoFromTableByRowHeader(taxTableData, 'Address 2', '')).trim();
			taxAddress += ', ' + (await this.getInfoFromTableByRowHeader(taxTableData, 'Address 3', '')).trim();
			// console.log(taxAddress)
			taxAddress = infoParser.parseAddress(taxAddress);
			// console.log(taxAddress);
			
			if(ownerAddress.street === ''){
				let remainingLinks = hyperlinks.slice(i);
				return {
					code: CONFIG.DEV_CONFIG.PAGE_ACCESS_ERROR_CODE,
					remaining_links: remainingLinks,
					processed_information: processedInformation
				};
			}

			for(visitAttemptCount = 0; visitAttemptCount < CONFIG.DEV_CONFIG.MAX_VISIT_ATTEMPTS; visitAttemptCount++){
				try{
					let transferTag;
					let sideMenu = await page.$$("div#sidemenu > li.unsel > a");
					//console.log(sideMenu);
					for(let i = 0; i < sideMenu.length; i++){
						handle = sideMenu[i];
						let prop = await handle.getProperty('innerText');
						let propJSON = await prop.jsonValue();
						if(propJSON.includes('Values')){

							transferTag = handle;
							break;
						}
					}
					await transferTag.click();
					await page.waitForSelector("table[id*='Appraised']", {timeout: CONFIG.DEV_CONFIG.PARCEL_TIMEOUT_MSEC});
				}
				catch(e){
					// console.log(e);
					console.log('Unable to visit values. Attempt #' + visitAttemptCount);
					await page.goto(thisURL);

					continue;
				}
				break;	
			}
			if(visitAttemptCount === CONFIG.DEV_CONFIG.MAX_VISIT_ATTEMPTS){
				console.log('Failed to reach values. Giving up.');
				continue;
				
			} 

			const valueTableData = await this.getTableDataBySelector(page, "table[id*='Appraised'] tr", false);
			let marketValue = await this.getInfoFromTableByRowHeader(valueTableData, 'Appraised Total', '');

			if(marketValue.trim() !== '') marketValue = parseInt(marketValue.replace(/[,\$]/g, ''));
			else marketValue = undefined;

			// console.log(marketValue);
			await page.goto(thisURL);
			for(visitAttemptCount = 0; visitAttemptCount < CONFIG.DEV_CONFIG.MAX_VISIT_ATTEMPTS; visitAttemptCount++){
				try{

					await page.waitForSelector("div#sidemenu", {timeout: CONFIG.DEV_CONFIG.PARCEL_TIMEOUT_MSEC});
					let transferTag;
					let sideMenu = await page.$$("div#sidemenu > li.unsel > a");
					for(let i = 0; i < sideMenu.length; i++){
						handle = sideMenu[i];
						let prop = await handle.getProperty('innerText');
						let propJSON = await prop.jsonValue();
						// console.log(propJSON);
						if(propJSON.includes('Sales')){
							transferTag = handle;
							break;
						}
					}
					await transferTag.click();
					await page.waitForSelector("table[id='Sales History']", {timeout: CONFIG.DEV_CONFIG.PARCEL_TIMEOUT_MSEC});
				}
				catch(e){
					// console.log(e);
					console.log('Unable to visit transfers. Attempt #' + visitAttemptCount);
					await page.goto(thisURL);

					continue;
				}
				break;	
			}
			if(visitAttemptCount === CONFIG.DEV_CONFIG.MAX_VISIT_ATTEMPTS){
				console.log('Failed to reach sales. Giving up.');
				continue;
				
			} 

			const conveyanceTableData = await this.getTableDataBySelector(page, "table[id='Sales History'] tr", false);
			let transferAmount = await this.getInfoFromTableByRowHeader(conveyanceTableData, 'Sale Price', '');

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

		let visitAttemptCount;
		for(visitAttemptCount = 0; visitAttemptCount < CONFIG.DEV_CONFIG.MAX_VISIT_ATTEMPTS; visitAttemptCount++){
			try{
				await page.goto(CONFIG.DEV_CONFIG.AUDITOR_ADVANCED_URL);
				// await page.waitForSelector("button#btAgree", {timeout: CONFIG.DEV_CONFIG.ACK_TIMEOUT_MSEC});
				await page.waitFor(200);
				let ackButton = await page.$("button#btAgree");
				await ackButton.click();
				await page.waitFor(200);
				throw "Acknowledge Button Clicked";
			} catch(e){
				try{
					await page.waitForSelector('select#sCriteria');
					await page.waitFor(200);

					await page.select('select#sCriteria', '16');
					await page.waitForSelector('input#ctl01_cal1_dateInput');
					await page.waitFor(200);

					await page.type('input#ctl01_cal1_dateInput', start);
					await page.type('input#ctl01_cal2_dateInput', end);

					await page.click('button#btAdd');
					await page.waitFor(200);

					await page.select('select#sCriteria', '17');
					await page.waitForSelector('input#txtCrit');
					await page.waitFor(200);

					await page.type('input#txtCrit', '50000');
					await page.type('input#txtCrit2', '10000000');

					await page.click('button#btAdd');
					await page.waitFor(200);

					await page.select('select#selPageSize','25');


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
			}	
				
			
			break;	
		}

		if(visitAttemptCount === CONFIG.DEV_CONFIG.MAX_VISIT_ATTEMPTS){
			console.log('Failed to reach auditor link. Giving up.');
			return {
				code: CONFIG.DEV_CONFIG.PAGE_ACCESS_ERROR_CODE,
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
	// let allHyperlinks = await scrape.getParcelIDsForDateRange(page, '01/01/2020','01/02/2020');
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
