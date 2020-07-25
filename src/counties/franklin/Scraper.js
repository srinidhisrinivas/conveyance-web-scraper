const InfoParser = require('../../InfoParser.js');
const puppeteer = require('puppeteer');
const ConfigReader = require('../../ConfigReader.js');
const ErrorLogger = require("../../ErrorLogger.js");
const ERROR_LOGGER = new ErrorLogger('franklin');
const CONFIG = new ConfigReader('franklin');
const targetAddress = CONFIG.DEV_CONFIG.FRANKLIN_TARGET_URL;

let Scraper = function(){
	this.getTableDataBySelector = async function(page, selector, value, html){
		if(html){
			return await page.$$eval("table["+selector+"*='"+value+"'] tr", rows => {
			  return Array.from(rows, row => {
			    const columns = row.querySelectorAll('td');
			    const datum = Array.from(columns, column => column.outerHTML);
			    return datum;
				  });

			});
		} else {
			return await page.$$eval("table["+selector+"*='"+value+"'] tr", rows => {
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
					await page.goto(pageLink);
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

			const ownerTableData = await this.getTableDataBySelector(page, 'id','Owner',false);
			// console.log('Owner Table Data:');
			// console.log(ownerTableData);
			let ownerNames = await this.getInfoFromTableByRowHeader(ownerTableData, 'Owner', ',');
			ownerNames = infoParser.parseOwnerNames(ownerNames);

			// console.log(ownerNames);
			let ownerAddress = await this.getInfoFromTableByRowHeader(ownerTableData, 'Owner Address',',');
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

			const transferTableData = await this.getTableDataBySelector(page, 'id','Transfer',false);
			let transferAmount = await this.getInfoFromTableByRowHeader(transferTableData,'Transfer Price','');
			transferAmount = parseInt(transferAmount.replace(/[,\$]/g, ''));

			const marketTableData = await this.getTableDataBySelector(page, 'id','Market Value',false);
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

			let sideMenu = await page.$$("div#sidemenu > li.unsel > a");
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
			

			const conveyanceTableData = await this.getTableDataBySelector(page, 'id', 'Sales Summary', false);
			const conveyanceCode = await this.getInfoFromTableByColumnHeader(conveyanceTableData, 'Inst Type', 0);

			currentInfo.conveyance_code = conveyanceCode;
			if(!infoValidator(currentInfo, processedInformation)){
				console.log('ConveyanceCode Validation Failed')
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

	this.getParcelIDHyperlinksForDate = async function(page, conveyanceDate){

		await page.goto(targetAddress);
		await page.type('input[name=StartDate]',conveyanceDate,{delay:20});
		await page.click('input[type=submit]');
		await page.waitForSelector('table.datatable');

		let allHyperlinks = [];
		let pageNum=1;	

		while(true){
	  	
			let resultTableData = await this.getTableDataBySelector(page, 'class', 'datatable',true);
			resultTableData.shift();

			// TODO get parcelID column index from table header or something
			const parcelIDColIndex = 1;
			const hyperlinks = [];
			for(let i = 0; i < resultTableData.length; i++){
				let html = resultTableData[i][parcelIDColIndex];
				let href = html.match(/href=".*"/)[0];
				let link = href.match(/".*"/)[0].replace(/"/g,'');
				hyperlinks.push(link);
			}
		
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