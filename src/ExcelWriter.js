const Excel = require('exceljs');
const ConfigReader = require('./ConfigReader.js');
const ERROR_LOGGER = require("./ErrorLogger.js");

let ExcelWriter = function(start, end, county){
	const CONFIG = new ConfigReader(county);
	this.startDate = start;
	this.endDate = end;
	this.county = county;
	this.writeToFile = async (filepath, information, finalpath) => {

		console.log(finalpath);
		const SHEET_NAME = 'Conveyances';
		let workbook = new Excel.Workbook();
		let sheet;
		if(finalpath === undefined){
			let currentDate = new Date();
			// let filename = 'Conveyances'+ '_' 
			// 			+ currentDate.getFullYear() + '_'
			// 			+ (currentDate.getMonth() < 9 ? '0' : '') + (currentDate.getMonth() + 1) + '_'
			// 			+ (currentDate.getDate() < 10 ? '0' : '') + currentDate.getDate() + '_'
			// 			+ (currentDate.getHours() < 10 ? '0' : '') + currentDate.getHours() + '_'
			// 			+ (currentDate.getMinutes() < 10 ? '0' : '') + currentDate.getMinutes() + '.xlsx';
			let filename = this.county.toUpperCase() + '_' 
						+ this.startDate.getFullYear()
						+ (this.startDate.getMonth() < 9 ? '0' : '') + (this.startDate.getMonth() + 1)
						+ (this.startDate.getDate() < 10 ? '0' : '') + this.startDate.getDate() + '_'
						+ this.endDate.getFullYear()
						+ (this.endDate.getMonth() < 9 ? '0' : '') + (this.endDate.getMonth() + 1)
						+ (this.endDate.getDate() < 10 ? '0' : '') + this.endDate.getDate()
						+ '.xlsx'

			finalpath = filepath + '\\' + filename;
			sheet = workbook.addWorksheet(SHEET_NAME);
			sheet.columns = [
				{header: 'Owner Name', key: 'owner', style:{font: {name:'Arial', size: 12}}},
				{header: 'Street', key: 'street', style:{font: {name:'Arial', size: 12}}},
				{header: 'City', key: 'city', style:{font: {name:'Arial', size: 12}}},
				{header: 'State', key: 'state', style:{font: {name:'Arial', size: 12}}},
				{header: 'ZIP', key: 'zip', style:{font: {name:'Arial', size: 12}}},
				{header: 'Transfer Value', key: 'transfer', style:{font: {name:'Arial', size: 12}}},
				{header: 'Market Value', key: 'value', style:{font: {name:'Arial', size: 12}}},
				{header: 'Code', key: 'code', style:{font: {name:'Arial', size: 12}}}

			];
			
		} else {
			await workbook.xlsx.readFile(finalpath);
			sheet = workbook.getWorksheet(SHEET_NAME);
		}
		
		
		for(let i = 0; i < information.length; i++){
			let conveyance = information[i];
			/*
			sheet.addRow({
				owner: conveyance.owner,
				street: conveyance.street,
				city: conveyance.city,
				state: conveyance.state,
				zip: conveyance.zip,
				transfer: conveyance.transfer,
				value: conveyance.value
			});
			*/
			let dataArray = [conveyance.owner,
							conveyance.street,
							conveyance.city,
							conveyance.state,
							conveyance.zip,
							conveyance.transfer,
							conveyance.value,
							conveyance.conveyance_code];
			sheet.addRow(dataArray);
		}

		await workbook.xlsx.writeFile(finalpath);

		return finalpath;
	}
	let appendToFileName = function(filepath, appendage){
		let fileparts = filepath.split('\\');
		let filename = fileparts.pop();
		let filedir = fileparts.join('\\');

		let nameparts = filename.split('.');
		let name = nameparts[0];
		let ext = nameparts[1];

		name = name + appendage;

		return filedir + '\\' + name + '.' + ext;
	}
	this.appendComplete = function(filepath){
		let newFilePath = appendToFileName(filepath, CONFIG.DEV_CONFIG.COMPLETE_APPEND);
		var fs = require('fs');
		fs.rename(filepath, newFilePath, function(err) {
		    if ( err ) console.log('ERROR: ' + err);
		});
		return newFilePath;
	}
	this.appendError = function(filepath){
		return appendToFileName(filepath, CONFIG.DEV_CONFIG.ERROR_APPEND);
	}
}
module.exports = ExcelWriter;