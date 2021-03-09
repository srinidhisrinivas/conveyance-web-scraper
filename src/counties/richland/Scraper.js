const InfoParser = require('../../InfoParser.js');
const puppeteer = require('puppeteer');
const ConfigReader = require('../../ConfigReader.js');
const ErrorLogger = require("../../ErrorLogger.js");

const ERROR_LOGGER = new ErrorLogger('richland');
const CONFIG = new ConfigReader('richland');

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

					// Go to auditor's page and wait for acknowledge button as in previous function.
					await page.goto(CONFIG.DEV_CONFIG.AUDITOR_PARCEL_URL);
					if(i <= 1){
						await page.waitForSelector("div.modal-footer > a.btn", {timeout: CONFIG.DEV_CONFIG.ACK_TIMEOUT_MSEC});
						await page.waitFor(200);
						let ackButton = await page.$("div.modal-footer > a.btn");
						await ackButton.click();
						await page.waitFor(200);
						throw "Acknowledge Button Clicked";
					} else {
						throw "Acknowledge Button Ignored"
					}
					
					
				}
				catch(e){
					// console.log(e);
					try{
				
						// Parcel ID text field
						await page.waitForSelector("input#ctlBodyPane_ctl02_ctl01_txtParcelID", {timeout: CONFIG.DEV_CONFIG.PARCEL_TIMEOUT_MSEC});

						// Triple click text field to select all text present in it already
						// This is done to select all the text so that we replace the pre-existing text
						//	 	when we type a new parcel ID
						await page.click('input#ctlBodyPane_ctl02_ctl01_txtParcelID', {clickCount: 3});					

						// Type the parcel ID in the field
						await page.type('input#ctlBodyPane_ctl02_ctl01_txtParcelID', pageLink);

						// Get and click the search button
						const searchButton = await page.$('a#ctlBodyPane_ctl02_ctl01_btnSearch');
						await searchButton.click();
						await page.waitFor(200);

						// Search for the information section on the property page, to confirm that we have found 
						// 		a property from the given search.
						await page.waitForSelector("section#ctlBodyPane_ctl01_mSection", {timeout: CONFIG.DEV_CONFIG.PARCEL_TIMEOUT_MSEC});
						await page.waitFor(200);
					
					} catch(e){
						// If any of the above `waitFors` times out, then that means we were unable to reach the page. Try again.
						// console.log(e);
						console.log('Unable to visit ' + pageLink + '. Attempt #' + visitAttemptCount);
						continue;
					}
				}
				
				
				break;	
			}

			// Return error if failed too many times.
			if(visitAttemptCount === CONFIG.DEV_CONFIG.MAX_VISIT_ATTEMPTS){
				console.log('Failed to reach ' + pageLink + '. Giving up.');
				return {
					return_status: CONFIG.DEV_CONFIG.PAGE_ACCESS_ERROR_CODE,
					scraped_information: []
				};
			}
			

			// Get the owner names. Sometimes appears as a link on this website.
			let owner1Handle = await page.$('span#ctlBodyPane_ctl01_ctl01_lnkOwnerName1_lblSearch');
			let owner1Link = await page.$('a#ctlBodyPane_ctl01_ctl01_lnkOwnerName1_lnkSearch');
			let prop;

			// Get the owner name either from either the link or the text field.
			// This is how you get the innerText property from a JSHandle
			try{
				if(owner1Handle) prop = await owner1Handle.getProperty('innerText');
				else if(owner1Link) prop = await owner1Link.getProperty('innerText');
			}
			catch(e){
				console.log('Name not found, skipping.');
				continue;
			}
			
			let baseOwnerName = await prop.jsonValue();

			
			let ownerNames = infoParser.parseOwnerNames(baseOwnerName);


			// Get the mailing tax name and address and manipulate them to get it as a string.
			try{
				let mailingHandle = await page.$('span#ctlBodyPane_ctl01_ctl01_lblMailing');
				prop = await mailingHandle.getProperty('innerText');	
			} catch (e){
				console.log('Address not found, skipping.');
				continue;
			}
			
			let taxInfo = await prop.jsonValue();
			taxInfo = taxInfo.split('\u000A');
			taxInfo.shift();
			let taxAddress = taxInfo[taxInfo.length-2] + ', ' + taxInfo[taxInfo.length-1];
			//console.log(taxAddress);
			let ownerAddress = infoParser.parseAddress(taxAddress);

			// Get the sales table data using the selector
			// When using this function, make sure you pass the `tr` element under the table selector
			// Can also be done like "table#ctlBodyPane_ctl12_ctl01_gvwSales tr" which gives `tr` present in the selector.
			let salesTableData = await this.getTableDataBySelector(page, "table#ctlBodyPane_ctl12_ctl01_gvwSales > tbody > tr",false);
			salesTableData = salesTableData.shift();
			let transferAmount = '';

			// If sales table data was found, get the relevant information from the sales table.
			if(salesTableData !== undefined){
				transferAmount = salesTableData[5];
			}

			// Convert the sales amount to int
			if(transferAmount.trim() !== '') transferAmount = parseInt(transferAmount.replace(/[,\$]/g, ''));
			else transferAmount = undefined;

			//console.log(transferAmount);
			
			//console.log('\n');

			// console.log(transferAmount);
			
			let marketValue = 0, tempMarkVal;

			let valueTableData = await this.getTableDataBySelector(page, "#ctlBodyPane_ctl02_ctl01_grdValuation_grdYearData tr", false);
			try{
				tempMarkVal = await this.getInfoFromTableByColumnHeader(valueTableData, '2020', valueTableData.length-2);	
			} catch(e){
				tempMarkVal = 'ERR';
			}
			
			if(tempMarkVal !== 'ERR') marketValue = parseInt(tempMarkVal.replace(/[,\$]/g,''));

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
			
			
		}
		return processedInformation;
	}

	this.getParcelIDsForDateRange = async function(page, start, end){

		let visitAttemptCount;
		for(visitAttemptCount = 0; visitAttemptCount < CONFIG.DEV_CONFIG.MAX_VISIT_ATTEMPTS; visitAttemptCount++){
			try{

				// Go to auditor's page and wait for acknowledge button as in previous function.
				await page.goto(CONFIG.DEV_CONFIG.AUDITOR_ADVANCED_URL);
				await page.waitForSelector("div.modal-footer > a.btn", {timeout: CONFIG.DEV_CONFIG.ACK_TIMEOUT_MSEC});
				await page.waitFor(200);
				let ackButton = await page.$("div.modal-footer > a.btn");
				await ackButton.click();
				await page.waitFor(200);
				throw "Acknowledge Button Clicked";
				
			}
			catch(e){
				try{
			
					// Wait for radio button
					await page.waitForSelector("input#ctlBodyPane_ctl00_ctl01_rdbUseSaleDateRange");
				
				} catch(e){
					// If any of the above `waitFors` times out, then that means we were unable to reach the page. Try again.
					console.log(e);
					console.log('Unable to visit ' + CONFIG.DEV_CONFIG.AUDITOR_ADVANCED_URL + '. Attempt #' + visitAttemptCount);
					continue;
				}
			}
			
			
			break;	
		}

		// Return error if failed too many times.
		if(visitAttemptCount === CONFIG.DEV_CONFIG.MAX_VISIT_ATTEMPTS){
			console.log('Failed to reach ' + CONFIG.DEV_CONFIG.AUDITOR_ADVANCED_URL + '. Giving up.');
			let errorMsg = "Failed to reach auditor page. Giving up.";
			throw errorMsg;
		}
		
		let allHyperlinks = [];
		let pageNum=1;	
	
		await page.click("input#ctlBodyPane_ctl00_ctl01_rdbUseSaleDateRange");

	
		await page.type('input#ctlBodyPane_ctl00_ctl01_txtSaleDateLowDetail', start);
		await page.waitFor(200);

		await page.type('input#ctlBodyPane_ctl00_ctl01_txtSaleDateHighDetail', end);
		await page.waitFor(200);					

		await page.type('input#ctlBodyPane_ctl00_ctl01_txtStartSalePrice', '50000');
		await page.waitFor(200);

		await page.click("input#ctlBodyPane_ctl00_ctl01_rdQualifiedSales_1");
		await page.waitFor(200);

		// Get and click the search button
		const searchButton = await page.$('a#ctlBodyPane_ctl00_ctl01_btnSearch');
		await searchButton.click();
		await page.waitFor(200);

		// Search for the information section on the property page, to confirm that we have found 
		// 		a property from the given search.
		await page.waitForSelector("#ctlBodyPane_ctl00_ctl01_gvwSalesResults", {timeout: CONFIG.DEV_CONFIG.PARCEL_TIMEOUT_MSEC});
		await page.waitFor(200);

		let resultTableData = await this.getTableDataBySelector(page, "#ctlBodyPane_ctl00_ctl01_gvwSalesResults tr",false);

		
		
		resultTableData.shift();
		resultTableData = resultTableData.map(row => row[1]);

		allHyperlinks = resultTableData;
		
		console.log(allHyperlinks);
		
		return allHyperlinks;
	}

}

module.exports = Scraper

function infoValidator(info, processedInformation){
	let valid = false;
	if(info.transfer + 50000 < info.value && info.transfer > 0) valid = true;
	if(processedInformation.some(e => e.owner === info.owner)) valid = false;	
	return valid;
	
}	
async function run(){
	const browser = await puppeteer.launch({headless: false});//, slowMo: 5});
	const page = await browser.newPage();
	const scrape = new Scraper();
	let allHyperlinks = await scrape.getParcelIDsForDateRange(page, '01/01/2020','01/05/2020');
	// let allHyperlinks = [
	// 		  '0270312308000',
	// 		  '0178021615000',
	// 		  '0512020618000',
	// 		  '0386017317012',
	// 		  '0372805301002',
	// 		  '0250907212000',
	// 		  '0460805518000',
	// 		  '0460802104000',
	// 		  '0386021417000',
	// 		  '0302402102000',
	// 		  '0289007418000',
	// 		  '0261102306000'
	// 		];

	let processedInformation = await scrape.processHyperLinks(page, allHyperlinks, infoValidator);
}

//run();
