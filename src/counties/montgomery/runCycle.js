const ConfigReader = require('../../ConfigReader.js');
const DateHandler = require('../../DateHandler.js');
const Scraper = require('./Scraper.js');
const ExcelWriter = require('../../ExcelWriter.js');
const puppeteer = require('puppeteer');

async function runCycle(start, end, remainingLinks, remainingDates, finalpath, headless){

	const county = 'montgomery';
	const CONFIG = new ConfigReader(county);
	let dateHandler = new DateHandler();

	start = dateHandler.incrementDate(new Date(Date.parse(start)));
	end = dateHandler.incrementDate(new Date(Date.parse(end)))

	function infoValidator(info, processedInformation){
		const validConvCodes = CONFIG.USER_CONFIG.VALID_CONV_CODES;	
		let valid = false;
		// console.log(info.transfer);
		// console.log(info.value);
		// console.log(info.transfer < info.value);
		if(info.value > 50000 && info.transfer > 0 && info.transfer + 50000 < info.value) valid = true;
		if(processedInformation.some(e => e.owner === info.owner)) valid = false;
		return valid;
		
	}	
	
	let excel = new ExcelWriter(start, end, county);
	
	//let scraper = new Scraper();
	let scraper = new Scraper();
	let targetDir = CONFIG.USER_CONFIG.TARGET_DIR;
	const browser = await puppeteer.launch({headless: headless});
	const page = await browser.newPage();
	let processedInformation = [];

	if(remainingLinks !== undefined){
		processedInformation = await scraper.processHyperLinks(page, remainingLinks, infoValidator);
		if(!Array.isArray(processedInformation)){
			// console.log(JSON.stringify(processedInformation,null,2));
			if(processedInformation.processed_information.length > 0){
				let currentInfo = processedInformation.processed_information;
				// currentInfo = currentInfo.filter(e => e.transfer < e.value && validConvCodes.includes(e.conveyanceCode));
				finalpath = await excel.writeToFile(targetDir, currentInfo, finalpath);	
			}
			await browser.close();
			processedInformation.finalpath = finalpath;
			return processedInformation;
		}
		// processedInformation = processedInformation.filter(e => e.transfer < e.value && validConvCodes.includes(e.conveyanceCode));
		// finalpath = await excel.writeToFile(targetDir, processedInformation, finalpath);
		if(finalpath === CONFIG.DEV_CONFIG.PATH_ERROR_CODE){
			// log the error that occurred. Try again, perhaps?
			// Low priority on this, because errors unlikely to happen here.
		}
	} else {
		start = dateHandler.formatMMMDDYYYY(start);
		end = dateHandler.formatMMMDDYYYY(end);

		console.log(start + ' - ' + end);

		allHyperlinks = await scraper.getParcelIDsForDateRange(page, start, end);
		if(allHyperlinks.length === 0){
			return {
				code: CONFIG.DEV_CONFIG.RESULTS_NOT_FOUND_ERROR_CODE,
				remaining_links: ['No data']
			};
		}
		
		if(!Array.isArray(allHyperlinks)){
			// log whatever error occurred
			// close browser
			// return exit code
		}
		processedInformation = await scraper.processHyperLinks(page, allHyperlinks, infoValidator);
		if(!Array.isArray(processedInformation)){
			// log whatever error occurred
			// console.log(JSON.stringify(processedInformation,null,2));
			if(processedInformation.processed_information.length > 0){
				let currentInfo = processedInformation.processed_information;
				// currentInfo = currentInfo.filter(e => e.transfer < e.value && validConvCodes.includes(e.conveyanceCode));
				finalpath = await excel.writeToFile(targetDir, currentInfo, finalpath);	
			}
			
			await browser.close();
			processedInformation.finalpath = finalpath;
			return processedInformation;
		}	
	}

	finalpath = await excel.writeToFile(targetDir, processedInformation, finalpath)
	
	await browser.close();
	finalpath = excel.appendComplete(finalpath);
	return {
		code: CONFIG.DEV_CONFIG.SUCCESS_CODE,
		finalpath: finalpath
	};
}

async function run(){
	
}
module.exports = runCycle