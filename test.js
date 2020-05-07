(async () => {
	var excel = require('exceljs');

	var w1 = new excel.Workbook();
	var worksheet = w1.addWorksheet('ExampleSheet');

	worksheet.columns = [
		{ header: 'Id', key: 'id', width: 10 },
		{ header: 'Name', key: 'name', width: 32 },
		{ header: 'D.O.B.', key: 'dob', width: 10 }
	];

	console.log('Before Writing:');
	console.log(worksheet.name);
	console.log(worksheet.getRow(1).getCell(1).value);
	console.log(worksheet.getRow(1).getCell('id').value);
	console.log('\n')

	await w1.xlsx.writeFile('test.xlsx');

	var w2 = new excel.Workbook();
	await w2.xlsx.readFile('test.xlsx');
	var worksheet2 = w2.getWorksheet('ExampleSheet');

	console.log('After Reading:')
	console.log(worksheet2.name);
	console.log(worksheet2.getRow(1).getCell(1).value)
	console.log(worksheet2.getRow(1).getCell('id').value);
})();