const puppeteer = require('puppeteer');
const fs = require('fs');
const Excel = require('exceljs');
const addressParser = require('parse-address');
const ExcelWriter = require('./ExcelWriter.js');
const DateHandler = require('./DateHandler.js');
const InfoParser = require('./InfoParser.js');
const Scraper = require('./Scraper.js');


async function runCycle(start, end, remainingLinks, remainingDates, finalpath){

	const validConvCodes = ['AM','CO','CE','ED','EE','EN','EX','FD','FE','GD','GE','GW','GX','LE','LW','PD','PE','QC','QE','SE','SU','SW','TD','TE','WD','WE'];
	let excel = new ExcelWriter();
	let dateHandler = new DateHandler();
	let scraper = new Scraper();
	let targetDir = targetFilepath;
	const browser = await puppeteer.launch({headless: false});
	const page = await browser.newPage();
	let dateList;

	start = dateHandler.incrementDate(new Date(Date.parse(start)));
	end = dateHandler.incrementDate(new Date(Date.parse(end)))
	if(remainingDates === undefined) dateList = dateHandler.convertDateRangeToList(start, end);
	else dateList = remainingDates;
	if(remainingLinks !== undefined){
		let processedInformation = await scraper.processHyperLinksForDate(page, allHyperlinks, date);
		processedInformation = processedInformation.filter(e => e.transfer < e.value && validConvCodes.includes(e.conveyanceCode));
		finalpath = await excel.writeToFile(targetDir, processedInformation, finalpath)
	}

	console.log(dateList);
	// If dateList === -1 throw error
	
	for(let i = 0; i < dateList.length; i++){
		let date = dateList[i];
		let allHyperlinks = await scraper.getParcelIDHyperlinksForDate(page, date);
		let processedInformation = await scraper.processHyperLinksForDate(page, allHyperlinks, date);
		processedInformation = processedInformation.filter(e => e.transfer < e.value && validConvCodes.includes(e.conveyanceCode));
		finalpath = await excel.writeToFile(targetDir, processedInformation, finalpath)
	}

	console.log('Complete!');
	await browser.close();
}

async function run(){
	// Check log for last exit code
	// If had to exit in between, get list of remaining links, dates and filename and pass to run cycle
	// If not, run cycle for a new thing
	// If exit with error code, log it and run again
	// If exit with normal code, close browser and end.
}

const targetStartDate = '04/02/2020';
const targetEndDate = '04/02/2020';
const targetFilepath = 'C:\\Python37\\Programs\\AuditorScraper\\Excel'
//run(targetStartDate, targetEndDate, targetFilepath);

module.exports = runCycle;
//console.log(addressParser.parseLocation(' 7926 TRIBUTARY LN, REYNOLDSBURG OH 43068'));
//parseAddress( '2312 EAST 5TH AVE, COLUMBUS, OH 43219');