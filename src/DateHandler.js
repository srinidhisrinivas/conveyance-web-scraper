let DateHandler = function(){
	this.incrementDate = function(date){
		date.setDate(date.getDate() + 1);
		return date
	}
	this.convertDateRangeToList = (start, end) => {
		
		if(start === 'today'){
			return [this.formatDate(Date.now())];
		}
		// if(start.getTime() > end.getTime()){
		// 	return -1;
		// }
		let dateList = [];
		for (var d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
	    	dateList.push(this.formatDate(new Date(d)));
		}
		return dateList;
	}
	this.formatDate = function(date){
		let day = date.getDate();
		let month = date.getMonth() + 1;
		let year = date.getFullYear();

		return (month < 10 ? '0' : '') + month + '/' + (day < 10 ? '0' : '') + day + '/' + year;
	}
	this.formatMMMDDYYYY = function(date){
		let day = date.getDate();
		let month = date.getMonth() + 1;
		let year = date.getFullYear();

		let MMMList = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

		return MMMList[month - 1] + '/' + (day < 10 ? '0' : '') + day + '/' + year;

	}

}

module.exports = DateHandler;