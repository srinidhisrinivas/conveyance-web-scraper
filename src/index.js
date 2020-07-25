const puppeteer = require('puppeteer');
const fs = require('fs');
const Excel = require('exceljs');
const ExcelWriter = require('./ExcelWriter.js');
const DateHandler = require('./DateHandler.js');
const InfoParser = require('./InfoParser.js');
const Scraper = require('./Scraper.js');
const DelScraper = require('./DelScraper.js');
const ConfigReader = require('./ConfigReader.js');


async function runCycle(start, end, remainingLinks, remainingDates, finalpath, county){

	const CONFIG = new ConfigReader(county);
	let dateHandler = new DateHandler();

	start = dateHandler.incrementDate(new Date(Date.parse(start)));
	end = dateHandler.incrementDate(new Date(Date.parse(end)))

	function infoValidator(info, processedInformation){
		const validConvCodes = CONFIG.USER_CONFIG.VALID_CONV_CODES;	
		let valid = false;
		if(info.transfer < info.value && info.transfer > 0) valid = true;
		if(processedInformation.some(e => e.owner === info.owner)) valid = false;
		if('conveyance_code' in info){
			return valid && validConvCodes.includes(info.conveyance_code);
		} else {
			return valid;
		}
	}	
	
	let excel = new ExcelWriter(start, end, county);
	
	//let scraper = new Scraper();
	let scraper;
	if(county === 'delaware') scraper = new DelScraper();
	else scraper = new Scraper();
	let targetDir = CONFIG.USER_CONFIG.TARGET_DIR;
	const browser = await puppeteer.launch({headless: true});
	const page = await browser.newPage();
	let dateList;

	if(remainingDates === undefined) dateList = dateHandler.convertDateRangeToList(start, end);
	else dateList = remainingDates;
	if(remainingLinks !== undefined){
		let processedInformation = await delScraper.processHyperLinks(page, remainingLinks, infoValidator);
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
		if(finalpath === CONFIG.DEV_CONFIG.PATH_ERROR_CODE){
			// log the error that occurred. Try again, perhaps?
			// Low priority on this, because errors unlikely to happen here.
		}
	}

	console.log(dateList);
	if(county === 'delaware') dateList = [0];
	
	for(let i = 0; i < dateList.length; i++){
		let date = dateList[i];
		let allHyperlinks;
		if(county === 'delaware') allHyperlinks = await scraper.getParcelIDsForDateRange(page, start, end);
		else allHyperlinks = await scraper.getParcelIDHyperlinksForDate(page, date);
		if(!Array.isArray(allHyperlinks)){
			// log whatever error occurred
			// close browser
			// return exit code
		}
		let processedInformation = await scraper.processHyperLinks(page, allHyperlinks, infoValidator);
		if(!Array.isArray(processedInformation)){
			// log whatever error occurred
			// console.log(JSON.stringify(processedInformation,null,2));
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
	finalpath = excel.appendComplete(finalpath);
	return {
		code: CONFIG.DEV_CONFIG.SUCCESS_CODE,
		finalpath: finalpath
	};
}

async function run(start, end, county){
	const CONFIG = new ConfigReader(county);
	let remainingDates, remainingLinks, finalpath, lastErroredLink = '', numLastLinkErrors = 0;
	//let runCycle = require('./'+county+'/runCycle.js');
	while(true){
		let returnStatus = await runCycle(start, end, remainingLinks, remainingDates, finalpath, county);
		if(returnStatus.code === CONFIG.DEV_CONFIG.SUCCESS_CODE){
			
			// log success
			console.log('Success');
			return returnStatus; 
		}
		// log error
		console.log(JSON.stringify(returnStatus,null,2));
		remainingDates = returnStatus.remaining_dates;
		let erroredLink = returnStatus.remaining_links[0];
		// If link causes error more than once
		if(erroredLink === lastErroredLink){
			numLastLinkErrors++;
			if(numLastLinkErrors > CONFIG.DEV_CONFIG.MAX_LINK_ERRORS){
				console.log(erroredLink + ' caused error more than ' + CONFIG.DEV_CONFIG.MAX_LINK_ERRORS + ' time. Skipping.');
				returnStatus.remaining_links.shift();
				numLastLinkErrors = 0;
			}
		} else {
			numLastLinkErrors = 0;
		}
		lastErroredLink = erroredLink;
		remainingLinks = returnStatus.remaining_links;
		finalpath = returnStatus.finalpath;
		console.log('Failed. See above error. Trying again.');
	}
	
}

module.exports = run;
//console.log(addressParser.parseLocation(' 7926 TRIBUTARY LN, REYNOLDSBURG OH 43068'));
//parseAddress( '2312 EAST 5TH AVE, COLUMBUS, OH 43219');