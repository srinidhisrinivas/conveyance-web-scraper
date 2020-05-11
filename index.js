const puppeteer = require('puppeteer');
const fs = require('fs');
const Excel = require('exceljs');
const addressParser = require('parse-address');
const ExcelWriter = require('./ExcelWriter.js');
const DateHandler = require('./DateHandler.js');
const InfoParser = require('./InfoParser.js');
const Scraper = require('./Scraper.js');


async function runCycle(start, end, remainingLinks, remainingDates, finalpath){

	let dateHandler = new DateHandler();

	start = dateHandler.incrementDate(new Date(Date.parse(start)));
	end = dateHandler.incrementDate(new Date(Date.parse(end)))

	function infoValidator(info){
		const validConvCodes = ['AM','CO','CE','ED','EE','EN','EX','FD','FE','GD','GE','GW','GX','LE','LW','PD','PE','QC','QE','SE','SU','SW','TD','TE','WD','WE'];	
		let valid = false;
		if(info.transfer < info.value) valid = true;
		if('conveyance_code' in info){
			return valid && validConvCodes.includes(info.conveyance_code);
		} else {
			return valid;
		}
	}	
	
	let excel = new ExcelWriter(start, end);
	
	let scraper = new Scraper();
	let targetDir = targetFilepath;
	const browser = await puppeteer.launch({headless: false});
	const page = await browser.newPage();
	let dateList;

	if(remainingDates === undefined) dateList = dateHandler.convertDateRangeToList(start, end);
	else dateList = remainingDates;
	if(remainingLinks !== undefined){
		let processedInformation = await scraper.processHyperLinks(page, remainingLinks, infoValidator);
		if(!Array.isArray(processedInformation)){
			console.log(JSON.stringify(processedInformation,null,2));
			if(processedInformation.processed_information.length > 0){
				let currentInfo = processedInformation.processed_information;
				// currentInfo = currentInfo.filter(e => e.transfer < e.value && validConvCodes.includes(e.conveyanceCode));
				finalpath = await excel.writeToFile(targetDir, currentInfo, finalpath);	
			}
			await browser.close();
			processedInformation.remaining_dates = remainingDates;
			processedInformation.finalpath = finalpath;
			return processedInformation;
		}
		// processedInformation = processedInformation.filter(e => e.transfer < e.value && validConvCodes.includes(e.conveyanceCode));
		finalpath = await excel.writeToFile(targetDir, processedInformation, finalpath);
		if(finalpath === 0){
			// log the error that occurred. Try again, perhaps?
			// Low priority on this, because errors unlikely to happen here.
		}
	}

	console.log(dateList);
	
	for(let i = 0; i < dateList.length; i++){
		let date = dateList[i];
		let allHyperlinks = await scraper.getParcelIDHyperlinksForDate(page, date);
		if(!Array.isArray(allHyperlinks)){
			// log whatever error occurred
			// close browser
			// return exit code
		}
		let processedInformation = await scraper.processHyperLinks(page, allHyperlinks, infoValidator);
		if(!Array.isArray(processedInformation)){
			// log whatever error occurred
			console.log(JSON.stringify(processedInformation,null,2));
			if(processedInformation.processed_information.length > 0){
				let currentInfo = processedInformation.processed_information;
				// currentInfo = currentInfo.filter(e => e.transfer < e.value && validConvCodes.includes(e.conveyanceCode));
				finalpath = await excel.writeToFile(targetDir, currentInfo, finalpath);	
			}
			remainingDates = dateList.slice(i+1);
			await browser.close();
			processedInformation.remaining_dates = remainingDates;
			processedInformation.finalpath = finalpath;
			return processedInformation;
		}
		// processedInformation = processedInformation.filter(e => (e.transfer < e.value) && validConvCodes.includes(e.conveyanceCode));
		finalpath = await excel.writeToFile(targetDir, processedInformation, finalpath)
	}
	await browser.close();
	return {
		code: 0
	};
}

async function run(start, end){
	let remainingDates, remainingLinks, finalpath;
	while(true){
		let returnStatus = await runCycle(start, end, remainingLinks, remainingDates, finalpath);
		if(returnStatus.code === 0){
			
			// log success
			console.log('Success');
			return; 
		}
		// log error
		console.log(JSON.stringify(returnStatus,null,2));
		remainingDates = returnStatus.remaining_dates;
		remainingLinks = returnStatus.remaining_links;
		finalpath = returnStatus.finalpath;
		console.log('Failed. See above error. Trying again.');
	}
	
}

const targetStartDate = '04/02/2020';
const targetEndDate = '04/02/2020';
const targetFilepath = 'C:\\Python37\\Programs\\AuditorScraper\\Excel'
//run(targetStartDate, targetEndDate, targetFilepath);

module.exports = run;
//console.log(addressParser.parseLocation(' 7926 TRIBUTARY LN, REYNOLDSBURG OH 43068'));
//parseAddress( '2312 EAST 5TH AVE, COLUMBUS, OH 43219');