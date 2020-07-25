const InfoParser = require('./InfoParser.js');
const puppeteer = require('puppeteer');
const ConfigReader = require('./ConfigReader.js');
const CONFIG = new ConfigReader('delaware');
const ERROR_LOGGER = require("./ErrorLogger.js");
const DateHandler = require('./DateHandler.js');

const recorderAddress = CONFIG.DEV_CONFIG.RECORDER_TARGET_URL;
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

		console.log(await page.$$eval(selector, trs => trs.map(tr => {
	    		const tds = [...tr.getElementsByTagName('td')];
	    		return tds.map(td => td.outerHTML);
			})));	
		if(html){
			return await page.$$eval(selector, trs => trs.map(tr => {
	    		const tds = [...tr.getElementsByTagName('td')];
	    		return tds.map(td => td.outerHTML);
			}));
		
		} else {
			return await page.$$eval(selector, trs => trs.map(tr => {
	    		const tds = [...tr.getElementsByTagName('td')];
	    		return tds.map(td => td.outerHTML);
			}));		
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
					await page.type('input#owner',pageLink);
					const searchButton = await page.$('button[name=btnSearch]');
					await searchButton.click();
					await page.waitForSelector("td[colspan='2'] > table.ui-corner-all");
					await page.waitFor(200);
					const ownerTableData = await this.getTableDataBySelector(page, "td[width='66%'] > table.ui-corner-all > tbody > tr",false);
					if(ownerTableData.length < 1){
						throw "Owner Table Not Found";
					}
					
				}
				catch(e){
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

			const ownerTableData = await this.getTableDataBySelector(page, "td[width='66%'] > table.ui-corner-all > tbody > tr",false);
			//console.log('Owner Table Data:');
			
			//console.log(ownerTableData);
			let ownerNames = await this.getInfoFromTableByRowHeader(ownerTableData, 'Owner Name', ',');
			ownerNames = infoParser.parseOwnerNames(ownerNames);

			// console.log(ownerNames);
			let ownerAddress = await this.getInfoFromTableByRowHeader(ownerTableData, 'Owner Address',',');
			ownerAddress = ownerAddress.replace(/\n/g,',');
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

			var transferTableData = await this.getTableDataBySelector(page, "td[colspan='2'] > table.ui-corner-all > tbody > tr",false);
			transferTableData = transferTableData.filter(row => row.includes('Total'))[0];
			transferTableData = transferTableData.slice(2);
			let transferAmount = transferTableData[1];
			transferAmount = parseInt(transferAmount.replace(/[,\$]/g, ''));

			let marketValue = transferTableData[3];
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

		let dateHandler = new DateHandler();
		start = dateHandler.formatDate(start).replace(/\//g,'');
		end = dateHandler.formatDate(end).replace(/\//g,'');

		await page.goto(recorderAddress);
		const signIn = await page.$('#ctl00_cphMain_blkLogin_btnGuestLogin');
		await signIn.click();
		await page.waitForNavigation();
		const acknowledge = await page.$('#ctl00_btnEmergencyMessagesClose');
		await acknowledge.click();
		await page.waitFor(500);
		
		await page.goto('https://cotthosting.com/ohdelaware/LandRecords/protected/v4/SrchDate.aspx');

		await page.select('select#ctl00_cphMain_tcMain_tpNewSearch_ucSrchDates_lbKindGroups', '73,74,76,77,78,79,61,58,51,52,53,41,7,8,9,26,29,30,32,91,92,93,94,95,96,97,98,99,88,89,101,102,104,105,106,111,122,70,126,127,128,129,130,132,138,161,183,192,193,206,217,220,226,224,240,245,246,255,256,271,277,303,304,296,317,318,314,315,755,326,323,324,347,348');

		const from = await page.$('input#ctl00_cphMain_tcMain_tpNewSearch_ucSrchDates_txtFiledFrom');
		await from.click();
		await page.waitFor(500);
		await page.type('input#ctl00_cphMain_tcMain_tpNewSearch_ucSrchDates_txtFiledFrom', start, {delay:300});
		await page.keyboard.press("Tab");
		
		
		const to = await page.$('input#ctl00_cphMain_tcMain_tpNewSearch_ucSrchDates_txtFiledThru')
		
		await page.type('input#ctl00_cphMain_tcMain_tpNewSearch_ucSrchDates_txtFiledThru', end, {delay:300});
		await page.keyboard.press("Tab");
		
		const searchButton = await page.$('#ctl00_cphMain_tcMain_tpNewSearch_ucSrchDates_btnSearch');
		await page.waitFor(1000);
		await searchButton.click();
		
		await page.waitForSelector("table[class='cottPagedGridView']", {timeout: 0});
		let allHyperlinks = [];
		let pageNum=1;	

		while(true){
	  		await page.waitFor(500);

			let resultTableData = await this.getTableDataBySelector(page, "table.cottPagedGridView > tbody > tr",false);
			
			if(!resultTableData) continue;
			resultTableData.shift();	
			//resultTabelData = resultTableData.filter(row => row.some(e => e.includes('DEED')));
			resultTableData = resultTableData.filter(row => row.some(e => e.includes('Parcel')));
			resultTableData = resultTableData.map(row => row.filter(e => e.includes("DEED") || e.includes("Parcel")));
			resultTableData = resultTableData.filter(row => row[0] === 'DEED');
			resultTableData = resultTableData.map(row => row[row.length - 1]);
			resultTableData = resultTableData.map(row => {
				var n = row.split(' ');
				return n[n.length - 1];
			})
			resultTableData = resultTableData.filter(row => !isNaN(row));
			console.log(resultTableData);
			
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

			const nextButton = await page.$('input#ctl00_cphMain_tcMain_tpInstruments_ucInstrumentsGridV2_cpInstruments_Top_ibResultsNextPage');
			// console.log(await (await nextButton.getProperty('outerHTML')).jsonValue());
			if(!nextButton) break;

			await nextButton.click();
			await page.waitFor(3000); // TODO: Wait for update to happen

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
