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
				let remainingLinks = hyperlinks.slice(i);
				return {
					code: CONFIG.DEV_CONFIG.PAGE_ACCESS_ERROR_CODE,
					remaining_links: remainingLinks,
					processed_information: processedInformation
				};
			}
			

			// Get the owner names. Sometimes appears as a link on this website.
			let owner1Handle = await page.$('span[id*=OwnerName1]');
			let owner1Link = await page.$('a[id*=OwnerName1]');
			let prop;
			let baseOwnerName;

			// Get the owner name either from either the link or the text field.
			// This is how you get the innerText property from a JSHandle
			try{
				if(owner1Handle) prop = await owner1Handle.getProperty('innerText');
				else if(owner1Link) prop = await owner1Link.getProperty('innerText');
				baseOwnerName = await prop.jsonValue();
			}
			catch(e){
				console.log('Name not found, skipping.');
				continue;
			}

			
			let ownerNames = infoParser.parseOwnerNames(baseOwnerName);
			let taxInfo;

			// Get the mailing tax name and address and manipulate them to get it as a string.
			try{
				let mailingHandle = await page.$('span#ctlBodyPane_ctl01_ctl01_lblMailing');
				prop = await mailingHandle.getProperty('innerText');
				taxInfo = await prop.jsonValue();
			} catch (e){
				console.log('Address not found, skipping.');
				continue;
			}
			
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
			// console.log(currentInfo);
			
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
	// let allHyperlinks = await scrape.getParcelIDsForDateRange(page, '01/01/2020','01/05/2020');
	let allHyperlinks =[
		  '0569218215000', '0553919412001', '0491202812002',
		  '0491200603008', '0482713004000', '0460811308000',
		  '0460811306000', '0460809711000', '0386015005001',
		  '0270718515000', '0270204316021', '0512020314001',
		  '0460810014000', '0444702912000', '0386024903000',
		  '0386021515000', '0372812512000', '0270718014000',
		  '0270213917000', '0270213901000', '0270205516000',
		  '0250928809000', '0250915102000', '0178021001037',
		  '0569219011007', '0569214302104', '0482714213000',
		  '0460814410000', '0460802503000', '0386019818000',
		  '0386014512000', '0289010216000', '0270714404000',
		  '0270714103000', '0270705016000', '0270309606000',
		  '0114012415001', '0553919303000', '0543815218000',
		  '0512020517000', '0482710517000', '0482709706000',
		  '0472603512000', '0386016912014', '0372805209000',
		  '0250928710000', '0250924202000', '0250902815000',
		  '0211706101000', '0114013106000', '0569218009000',
		  '0533703209000', '0491202316001', '0482711818000',
		  '0472610516000', '0460811412000', '0444701002000',
		  '0386020217000', '0386019513000', '0372807904007',
		  '0270710202000', '0270704015000', '0250915402000',
		  '0181414512001', '0178021001050'
		];
	let processedInformation = await scrape.processHyperLinks(page, allHyperlinks, infoValidator);
}

// run();
