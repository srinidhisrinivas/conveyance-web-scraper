const Excel = require('exceljs');
let ExcelWriter = function(){
	this.writeToFile = async (filepath, information, finalpath) => {

		console.log(finalpath);
		const SHEET_NAME = 'Conveyances';
		let workbook = new Excel.Workbook();
		let sheet;
		if(finalpath === undefined){
			let currentDate = new Date();
			let filename = 'Conveyances'+ '_' 
						+ currentDate.getFullYear() + '_'
						+ (currentDate.getMonth() < 9 ? '0' : '') + (currentDate.getMonth() + 1) + '_'
						+ (currentDate.getDate() < 10 ? '0' : '') + currentDate.getDate() + '_'
						+ (currentDate.getHours() < 10 ? '0' : '') + currentDate.getHours() + '_'
						+ (currentDate.getMinutes() < 10 ? '0' : '') + currentDate.getMinutes() + '.xlsx';
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
			let dataArray = [conveyance.owner, conveyance.street, conveyance.city, conveyance.state, conveyance.zip, conveyance.transfer, conveyance.value];
			sheet.addRow(dataArray);
		}

		await workbook.xlsx.writeFile(finalpath);

		return finalpath;
	}
}
module.exports = ExcelWriter;