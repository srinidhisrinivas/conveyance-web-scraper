const InfoParser = require('./InfoParser.js');

const targetAddress = 'https://apps.franklincountyauditor.com/dailyconveyance';

let Scraper = function(){
	this.getTableDataBySelector = async function(page, selector, value, html){
		if(html){
			return await page.$$eval("table["+selector+"*='"+value+"'] tr", rows => {
			  return Array.from(rows, row => {
			    const columns = row.querySelectorAll('td');
			    const datum = Array.from(columns, column => column.outerHTML);
			    return datum;
				  });

			});
		} else {
			return await page.$$eval("table["+selector+"*='"+value+"'] tr", rows => {
			  return Array.from(rows, row => {
			    const columns = row.querySelectorAll('td');
			    const datum = Array.from(columns, column => column.innerText);
			    return datum;
				  });

			});
		}
		
		return tableData;
	}

	this.getInfoFromTableByRowHeader = async function(table, header, delimiter){
		let inTargetHeader = false;
		let info = '';
		for(let i = 0; i < table.length; i++){
			let row = table[i];
			let rowHeader = row[0].trim();
			if(inTargetHeader){
				if(rowHeader === ''){
					info += delimiter + ' ' + row[row.length - 1];
				} else {
					inTargetHeader = false;
					break;
				}
			} 
			else if(rowHeader === header){
				inTargetHeader = true;
				info += row[row.length-1];
			} 
		}
		return info;
	}
	this.getInfoFromTableByColumnHeader = async function(table, header, rowNum){
		let headers = table.shift();
		// console.log(headers);
		// console.log(header);
		let colIndex = headers.indexOf(header);
		if(colIndex > 0){
			return table[rowNum][colIndex];
		} else {
			return 'ERR'
		}
	}


	this.processHyperLinksForDate = async function(page, hyperlinks, conveyanceDate){
		let processedInformation = [];
		let infoParser = new InfoParser();
		for(let i = 0; i < hyperlinks.length; i++){
			let pageLink = hyperlinks[i];
			console.log(pageLink);
			try{
				await page.goto(pageLink);
			}
			catch(e){
				console.log('Unable to visit link');
				continue;
			}

			// const parcelIDString = (await (await (await page.$('.DataletHeaderTopLeft')).getProperty('innerText')).jsonValue());
			// const parcelID = parcelIDString.substring(parcelIDString.indexOf(':')+2);

			const ownerTableData = await this.getTableDataBySelector(page, 'id','Owner',false);
			let ownerNames = await this.getInfoFromTableByRowHeader(ownerTableData, 'Owner', ',');
			ownerNames = infoParser.parseOwnerNames(ownerNames);

			// console.log(ownerNames);
			let ownerAddress = await this.getInfoFromTableByRowHeader(ownerTableData, 'Owner Address',',');
			ownerAddress = infoParser.parseAddress(ownerAddress);

			const transferTableData = await this.getTableDataBySelector(page, 'id','Transfer',false);
			let transferAmount = await this.getInfoFromTableByRowHeader(transferTableData,'Transfer Price','');
			transferAmount = parseInt(transferAmount.replace(/[,\$]/g, ''));

			const marketTableData = await this.getTableDataBySelector(page, 'id','Market Value',false);
			let marketValue = await this.getInfoFromTableByRowHeader(marketTableData, 'Total','');
			marketValue = parseInt(marketValue.replace(/,/g, ''));


			let sideMenu = await page.$$("div#sidemenu > li.unsel > a");
			let transferTag;
			for(let i = 0; i < sideMenu.length; i++){
				handle = sideMenu[i];
				let prop = await handle.getProperty('innerText');
				let propJSON = await prop.jsonValue();
				if(propJSON === 'Transfers') transferTag = handle;
			}
			
			await transferTag.click();
			await page.waitForSelector("table[id='Sales Summary']");

			const conveyanceTableData = await this.getTableDataBySelector(page, 'id', 'Sales Summary', false);
			const conveyanceCode = await this.getInfoFromTableByColumnHeader(conveyanceTableData, 'Inst Type', 0);
			console.log(conveyanceCode);

			processedInformation.push({
				owner: ownerNames,
				street: ownerAddress.street,
				city: ownerAddress.city,
				state: ownerAddress.state,
				zip: ownerAddress.zip,
				transfer: transferAmount,
				value: marketValue,
				conveyanceCode: conveyanceCode
			});

			console.log(processedInformation[processedInformation.length - 1]);

			// console.log('Parcel ID: ' + parcelID);
			// console.log('Owner: ' + ownerNames);
			// console.log('Owner Address: ' + ownerAddress);
			// console.log('Transfer Price: ' + transferAmount);
			// console.log('Market Value: ' + marketValue);
			// console.log('\n')
			
		}
		return processedInformation;
	}

	this.getParcelIDHyperlinksForDate = async function(page, conveyanceDate){

		await page.goto(targetAddress);
		await page.type('input[name=StartDate]',conveyanceDate,{delay:20});
		await page.click('input[type=submit]');
		await page.waitForSelector('table.datatable');

		let allHyperlinks = [];
		let pageNum=1;	

		while(true){
	  	
			let resultTableData = await this.getTableDataBySelector(page, 'class', 'datatable',true);
			resultTableData.shift();

			// TODO get parcelID column index from table header or something
			const parcelIDColIndex = 1;
			const hyperlinks = [];
			for(let i = 0; i < resultTableData.length; i++){
				let html = resultTableData[i][parcelIDColIndex];
				let href = html.match(/href=".*"/)[0];
				let link = href.match(/".*"/)[0].replace(/"/g,'');
				hyperlinks.push(link);
			}
		
			console.log('Page num '+pageNum);
			console.log(hyperlinks);

			if(hyperlinks === undefined || hyperlinks.length == 0){
				break;
			} else {
				console.log('Number of results on this page: ' + hyperlinks.length);
				allHyperlinks = allHyperlinks.concat(hyperlinks);
			}
			pageNum++;

			const nextButton = await page.$('ul.pagination > li > a[rel=next]');
			// console.log(await (await nextButton.getProperty('outerHTML')).jsonValue());
			if(!nextButton) break;

			await nextButton.click();
			await page.waitFor(500); // TODO: Wait for update to happen

		}
		return allHyperlinks;
	}

}

module.exports = Scraper