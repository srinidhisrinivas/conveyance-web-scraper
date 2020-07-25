const ConfigReader = require('../../ConfigReader.js');
const DateHandler = require('../../DateHandler.js');
const Scraper = require('./Scraper.js');
const ExcelWriter = require('../../ExcelWriter.js');
const puppeteer = require('puppeteer');

async function runCycle(start, end, remainingLinks, remainingDates, finalpath){
	const county = 'franklin';
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
	let scraper = new Scraper();
	let targetDir = CONFIG.USER_CONFIG.TARGET_DIR;
	const browser = await puppeteer.launch({headless: true});
	const page = await browser.newPage();
	let dateList;

	if(remainingDates === undefined) dateList = dateHandler.convertDateRangeToList(start, end);
	else dateList = remainingDates;
	if(remainingLinks !== undefined){
		let processedInformation = await scarper.processHyperLinks(page, remainingLinks, infoValidator);
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
	
	for(let i = 0; i < dateList.length; i++){
		let date = dateList[i];
		let allHyperlinks;
		allHyperlinks = await scraper.getParcelIDHyperlinksForDate(page, date);
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
module.exports = runCycle