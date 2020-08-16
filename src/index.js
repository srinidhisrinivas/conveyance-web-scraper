const puppeteer = require('puppeteer');
const fs = require('fs');
const Excel = require('exceljs');
const ExcelWriter = require('./ExcelWriter.js');
const DateHandler = require('./DateHandler.js');
const InfoParser = require('./InfoParser.js');
// const Scraper = require('./Scraper.js');
// const DelScraper = require('./DelScraper.js');
const ConfigReader = require('./ConfigReader.js');


async function run(start, end, county, headless){
	const CONFIG = new ConfigReader(county);
	let remainingDates, remainingLinks, finalpath, lastErroredLink = '', numLastLinkErrors = 1;
	let runCycle = require('./counties/'+county+'/runCycle.js');
	headless = (headless === 'true');
	while(true){
		// remainingLinks = [
		//   '612-0120-0209-00',
		//   '612-0120-0302-00',
		//   '612-0131-0111-00',
		//   '651-0016-0026-00',
		//   '651-0039-0150-00',
		//   '651-0048-0047-00'
		// ]; 

		let returnStatus = await runCycle(start, end, remainingLinks, remainingDates, finalpath, headless);
		if(returnStatus.code === CONFIG.DEV_CONFIG.SUCCESS_CODE){
			
			// log success
			console.log('Success');
			return returnStatus; 
		} else if(returnStatus.code === CONFIG.DEV_CONFIG.RESULTS_NOT_FOUND_ERROR_CODE){
			console.log(JSON.stringify(returnStatus,null,2));
			numLastLinkErrors++;
			if(numLastLinkErrors > CONFIG.DEV_CONFIG.MAX_LINK_ERRORS){
				console.log('Data not found after ' + CONFIG.DEV_CONFIG.MAX_LINK_ERRORS + ' attempts. Aborting.');
				throw "Data not found!";
				break;
			}
		} else {
			console.log(JSON.stringify(returnStatus,null,2));	
			remainingDates = returnStatus.remaining_dates;
			let erroredLink = returnStatus.remaining_links[0];
			// If link causes error more than once

			if(erroredLink === lastErroredLink){
				numLastLinkErrors++;
				if(numLastLinkErrors > CONFIG.DEV_CONFIG.MAX_LINK_ERRORS){
					console.log(erroredLink + ' caused error more than ' + CONFIG.DEV_CONFIG.MAX_LINK_ERRORS + ' time. Skipping.');
					returnStatus.remaining_links.shift();
					numLastLinkErrors = 1;
				}
			} else {
				numLastLinkErrors = 1;
			}
			lastErroredLink = erroredLink;
			remainingLinks = returnStatus.remaining_links;
			finalpath = returnStatus.finalpath;
			console.log('Failed. See above error. Trying again.');
		}
		// log error
		
	}
	
}

// async function test(){
// 	await run('01/01/2020','01/01/2020','hamilton', 'false');
// }
// test();
module.exports = run;
//console.log(addressParser.parseLocation(' 7926 TRIBUTARY LN, REYNOLDSBURG OH 43068'));
//parseAddress( '2312 EAST 5TH AVE, COLUMBUS, OH 43219');