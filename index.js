const puppeteer = require('puppeteer');
const fs = require('fs');
const Excel = require('exceljs');
const addressParser = require('parse-address');
const ExcelWriter = require('./ExcelWriter.js');
const DateParser = require('./DateParser.js');
const InfoParser = require('./InfoParser.js');

const targetAddress = 'https://apps.franklincountyauditor.com/dailyconveyance';

async function getTableDataBySelector(page, selector, value, html){
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
	
	return tableData;
}

async function getInfoFromTableByRowHeader(table, header, delimiter){
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


async function processHyperLinksForDate(page, hyperlinks, conveyanceDate){
	let processedInformation = [];
	let infoParser = new InfoParser();
	for(let i = 0; i < 5; i++){
		let pageLink = hyperlinks[i];
		console.log(pageLink);
		try{
		await page.goto(pageLink);
		}
		catch(e){
			console.log('Unable to visit link');
			continue;
		}

		// const parcelIDString = (await (await (await page.$('.DataletHeaderTopLeft')).getProperty('innerText')).jsonValue());
		// const parcelID = parcelIDString.substring(parcelIDString.indexOf(':')+2);

		const ownerTableData = await getTableDataBySelector(page, 'id','Owner',false);
		let ownerNames = await getInfoFromTableByRowHeader(ownerTableData, 'Owner', ',');
		ownerNames = infoParser.parseOwnerNames(ownerNames);

		// console.log(ownerNames);
		let ownerAddress = await getInfoFromTableByRowHeader(ownerTableData, 'Owner Address',',');
		ownerAddress = infoParser.parseAddress2(ownerAddress);

		const transferTableData = await getTableDataBySelector(page, 'id','Transfer',false);
		let transferAmount = await getInfoFromTableByRowHeader(transferTableData,'Transfer Price','');
		transferAmount = parseInt(transferAmount.replace(/[,\$]/g, ''));

		const marketTableData = await getTableDataBySelector(page, 'id','Market Value',false);
		let marketValue = await getInfoFromTableByRowHeader(marketTableData, 'Total','');
		marketValue = parseInt(marketValue.replace(/,/g, ''));

		processedInformation.push({
			owner: ownerNames,
			street: ownerAddress.street,
			city: ownerAddress.city,
			state: ownerAddress.state,
			zip: ownerAddress.zip,
			transfer: transferAmount,
			value: marketValue
		});

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

async function getParcelIDHyperlinksForDate(page, conveyanceDate){

	await page.goto(targetAddress);
	await page.type('input[name=StartDate]',conveyanceDate,{delay:20});
	await page.click('input[type=submit]');
	await page.waitForSelector('table.datatable');

	let allHyperlinks = [];
	let pageNum=1;	

	while(true){
  	
		let resultTableData = await getTableDataBySelector(page, 'class', 'datatable',true);
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



async function run(start, end, filepath){

	let excel = new ExcelWriter();
	let dateParser = new DateParser();
	console.log(excel);
	if(filepath === undefined) filepath = targetFilepath;
	console.log('Filepath: '+filepath);
	const browser = await puppeteer.launch({headless: false});
	const page = await browser.newPage();

	start = new Date(Date.parse(start));
	start.setDate(start.getDate() + 1);
	end = new Date(Date.parse(end));
	end.setDate(end.getDate() + 1);
	let dateList = dateParser.convertDateRangeToList(new Date(Date.parse(start)), new Date(Date.parse(end)));
	let finalpath;
	console.log(dateList);
	// If dateList === -1 throw error
	let totalInformation = [];
	for(let i = 0; i < dateList.length; i++){
		let date = dateList[i];
		let allHyperlinks = await getParcelIDHyperlinksForDate(page, date);
		let processedInformation = await processHyperLinksForDate(page, allHyperlinks, date);
		processedInformation = processedInformation.filter(e => e.transfer < e.value);
		finalpath = await excel.writeToFile(filepath, processedInformation, finalpath)
		// totalInformation = totalInformation.concat(processedInformation);
	}
	// TODO: filter information
	//console.log(JSON.stringify(totalInformation,null,2));
	
	console.log('Complete!');
	await browser.close();
}

const targetStartDate = '04/02/2020';
const targetEndDate = '04/02/2020';
const targetFilepath = 'C:\\Python37\\Programs\\AuditorScraper\\Excel'
//run(targetStartDate, targetEndDate, targetFilepath);

module.exports = run;
//console.log(addressParser.parseLocation(' 7926 TRIBUTARY LN, REYNOLDSBURG OH 43068'));
//parseAddress( '2312 EAST 5TH AVE, COLUMBUS, OH 43219');