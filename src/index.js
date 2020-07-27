const puppeteer = require('puppeteer');
const fs = require('fs');
const Excel = require('exceljs');
const ExcelWriter = require('./ExcelWriter.js');
const DateHandler = require('./DateHandler.js');
const InfoParser = require('./InfoParser.js');
// const Scraper = require('./Scraper.js');
// const DelScraper = require('./DelScraper.js');
const ConfigReader = require('./ConfigReader.js');


async function run(start, end, county){
	const CONFIG = new ConfigReader(county);
	let remainingDates, remainingLinks, finalpath, lastErroredLink = '', numLastLinkErrors = 1;
	let runCycle = require('./counties/'+county+'/runCycle.js');
	while(true){
		let returnStatus = await runCycle(start, end, remainingLinks, remainingDates, finalpath);
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
	
}

module.exports = run;
//console.log(addressParser.parseLocation(' 7926 TRIBUTARY LN, REYNOLDSBURG OH 43068'));
//parseAddress( '2312 EAST 5TH AVE, COLUMBUS, OH 43219');