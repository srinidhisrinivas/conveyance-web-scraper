const InfoParser = require('../../InfoParser.js');
const puppeteer = require('puppeteer');
const ConfigReader = require('../../ConfigReader.js');
const ErrorLogger = require("../../ErrorLogger.js");
const ERROR_LOGGER = new ErrorLogger('franklin');
const CONFIG = new ConfigReader('franklin');
const targetAddress = CONFIG.DEV_CONFIG.FRANKLIN_TARGET_URL;
const parcelSearchAddress = "https://property.franklincountyauditor.com/_web/search/commonsearch.aspx?mode=parid";

let Scraper = function(){
	this.getTableDataBySelector = async function(page, selector, value, html){
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
			pageLink = pageLink.replace(/-/g,'');
			let visitAttemptCount;
			for(visitAttemptCount = 0; visitAttemptCount < CONFIG.DEV_CONFIG.MAX_VISIT_ATTEMPTS; visitAttemptCount++){
			
				try{
					await page.goto(parcelSearchAddress);

					await page.waitForSelector("input#inpParid");
					await page.click('input#inpParid', {clickCount: 3});					
					await page.type('input#inpParid', pageLink);
					const searchButton = await page.$('button#btSearch');
					await searchButton.click();
					
					await page.waitForSelector("table#Owner", {timeout: 15000});
					await page.waitFor(200);
					
					const ownerTableData = await this.getTableDataBySelector(page, "table#Owner tr",false);
					
					if(ownerTableData.length < 1){
						throw "Owner Table Not Found";
					}
					
				}
				catch(e){
					console.log(e);
					console.log('Unable to visit ' + parcelSearchAddress + '. Attempt #' + visitAttemptCount);
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

			let ownerTableData = await this.getTableDataBySelector(page, "#Owner tr",false);
			ownerTableData = ownerTableData.filter(row => row.length == 2);
			ownerTableData = ownerTableData.filter(row => row.every(el => el.trim().length > 0));
			// console.log('Owner Table Data:');
			// console.log(ownerTableData);
			let ownerNames = await this.getInfoFromTableByRowHeader(ownerTableData, 'Owner', ',');
			ownerNames = infoParser.parseOwnerNames(ownerNames);

			// console.log(ownerNames);
			let ownerAddress1 = await this.getInfoFromTableByRowHeader(ownerTableData, 'Owner Mailing /',',');
			let ownerAddress2 = await this.getInfoFromTableByRowHeader(ownerTableData, 'Contact Address',',');
			ownerAddress1 = ownerAddress1.replace(/,/g, '')
			ownerAddress2 = ownerAddress2.replace(/,/g, '')
			let ownerAddress = ownerAddress1 + ', ' + ownerAddress2;
			// console.log('Owner Address: ' + ownerAddress);
			ownerAddress = infoParser.parseAddress(ownerAddress);
			// console.log('Street: ' + ownerAddress.street);
			if(ownerAddress.street === ''){
				let remainingLinks = hyperlinks.slice(i);
				return {
					code: CONFIG.DEV_CONFIG.PAGE_ACCESS_ERROR_CODE,
					remaining_links: remainingLinks,
					processed_information: processedInformation
				};
			}

			const transferTableData = await this.getTableDataBySelector(page, "table[id*='Transfer'] tr",false);
			let transferAmount = await this.getInfoFromTableByRowHeader(transferTableData,'Transfer Price','');
			transferAmount = parseInt(transferAmount.replace(/[,\$]/g, ''));

			const marketTableData = await this.getTableDataBySelector(page, "table[id*='2020 Auditor'] tr",false);
			let marketValue = await this.getInfoFromTableByRowHeader(marketTableData, 'Total','');
			marketValue = parseInt(marketValue.replace(/,/g, ''));

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

			let sideMenu = await page.$$("div#sidemenu li.unsel > a");
			let transferTag;
			for(let i = 0; i < sideMenu.length; i++){
				handle = sideMenu[i];
				let prop = await handle.getProperty('innerText');
				let propJSON = await prop.jsonValue();
				if(propJSON === 'Transfers') transferTag = handle;
			}

			for(visitAttemptCount = 0; visitAttemptCount < CONFIG.DEV_CONFIG.MAX_VISIT_ATTEMPTS; visitAttemptCount++){
				try{
					await transferTag.click();
					await page.waitForSelector("table[id='Sales Summary']");
				}
				catch(e){
					console.log('Unable to visit transfers. Attempt #' + visitAttemptCount);
					continue;
				}
				break;	
			}
			if(visitAttemptCount === CONFIG.DEV_CONFIG.MAX_VISIT_ATTEMPTS){
				console.log('Failed to reach transfers. Giving up.');
				let remainingLinks = hyperlinks.slice(i);
				return {
					code: CONFIG.DEV_CONFIG.PAGE_ACCESS_ERROR_CODE,
					remaining_links: remainingLinks,
					processed_information: processedInformation
				};
			}
			

			const conveyanceTableData = await this.getTableDataBySelector(page, "table[id*='Sales Summary'] tr", false);
			const conveyanceCode = await this.getInfoFromTableByColumnHeader(conveyanceTableData, 'Inst Type', 0);

			currentInfo.conveyance_code = conveyanceCode;

			if(!infoValidator(currentInfo, processedInformation)){
				console.log('ConveyanceCode Validation Failed')
				continue;
			}
			processedInformation.push(currentInfo);

			console.log(processedInformation[processedInformation.length - 1]);

		}
		return processedInformation;
	}

	this.getParcelIDHyperlinksForDate = async function(page, conveyanceDate){

		await page.goto(targetAddress);
		await page.type('input[name=StartDate]',conveyanceDate,{delay:20});
		await page.click('input[type=submit]');
		await page.waitForSelector('table.datatable');

		let allHyperlinks = [];
		let pageNum=1;	

		while(true){
	  	
			let resultTableData = await this.getTableDataBySelector(page, ".datatable tr",false);
			resultTableData.shift();
			resultTableData = resultTableData.filter(row => row.length > 0);

			// console.log(resultTableData);
			
			// TODO get parcelID column index from table header or something
			const parcelIDColIndex = 1;
			let hyperlinks = [];
			for(let i = 0; i < resultTableData.length; i++){
				
				let pIDCol = resultTableData[i][parcelIDColIndex];
				try{
					let els = pIDCol.split('\n');
				
					if(els.length > 0 && els[0].match(/[0-9]*-[0-9]*-[0-9]*/)){
						hyperlinks.push(els[0]);	
					}
				} catch(e) {
					continue;
				}
				
				
			}
			hyperlinks = hyperlinks.filter(el => el.length > 0);
		
			console.log('Page num '+pageNum);
			console.log(hyperlinks);

			if(hyperlinks === undefined || hyperlinks.length == 0){
				break;
			} else {
				console.log('Number of results on this page: ' + hyperlinks.length);
				allHyperlinks = allHyperlinks.concat(hyperlinks);
			}
			pageNum++;

			const nextButton = await page.$('ul.pagination > li > a[rel=next]');
			// console.log(await (await nextButton.getProperty('outerHTML')).jsonValue());
			if(!nextButton) break;

			await nextButton.click();
			await page.waitFor(500); // TODO: Wait for update to happen

		}
		return allHyperlinks;
	}

}
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
	// let allHyperlinks = await scrape.getParcelIDHyperlinksForDate(page, '03/01/2021');
	let allHyperlinks = [
	  '273-012340-00', '273-012210-00',
	  '273-005928-00', '010-102249-00',
	  '010-268516-00', '010-103410-00',
	  '010-113956-00', '100-001043-00',
	  '010-277111-00', '010-079854-00',
	  '010-000826-00', '010-113982-00',
	  '010-113983-00', '010-188443-00',
	  '170-001982-00', '150-002185-00',
	  '230-000500-00', '230-000070-00',
	  '010-064426-00', '010-069023-00'
	];


	let processedInformation = await scrape.processHyperLinks(page, allHyperlinks, infoValidator);
}

// run();
module.exports = Scraper