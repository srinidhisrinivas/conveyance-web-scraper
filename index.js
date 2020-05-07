const puppeteer = require('puppeteer');
const fs = require('fs');
const Excel = require('exceljs');
const addressParser = require('parse-address');
const ExcelWriter = require('./ExcelWriter.js');
const DateHandler = require('./DateHandler.js');
const InfoParser = require('./InfoParser.js');
const Scraper = require('./Scraper.js');


async function run(start, end, filepath){

	const validConvCodes = ['AM','CO','CE','ED','EE','EN','EX','FD','FE','GD','GE','GW','GX','LE','LW','PD','PE','QC','QE','SE','SU','SW','TD','TE','WD','WE'];
	let excel = new ExcelWriter();
	let dateHandler = new DateHandler();
	let scraper = new Scraper();
	console.log(excel);
	if(filepath === undefined) filepath = targetFilepath;
	console.log('Filepath: '+filepath);
	const browser = await puppeteer.launch({headless: false});
	const page = await browser.newPage();

	start = dateHandler.incrementDate(new Date(Date.parse(start)));
	end = dateHandler.incrementDate(new Date(Date.parse(end)))
	let dateList = dateHandler.convertDateRangeToList(start, end);
	let finalpath;
	console.log(dateList);
	// If dateList === -1 throw error
	let totalInformation = [];
	for(let i = 0; i < dateList.length; i++){
		let date = dateList[i];
		let allHyperlinks = await scraper.getParcelIDHyperlinksForDate(page, date);
		let processedInformation = await scraper.processHyperLinksForDate(page, allHyperlinks, date);
		processedInformation = processedInformation.filter(e => e.transfer < e.value && validConvCodes.includes(e.conveyanceCode));
		finalpath = await excel.writeToFile(filepath, processedInformation, finalpath)
		// totalInformation = totalInformation.concat(processedInformation);
	}
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