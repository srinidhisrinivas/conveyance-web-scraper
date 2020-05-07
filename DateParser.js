let DateParser = function(){
	this.convertDateRangeToList = (start, end) => {
		function formatDate(date){
			day = date.getDate();
			month = date.getMonth() + 1;
			year = date.getFullYear();

			return (month < 9 ? '0' : '') + month + '/' + (day < 9 ? '0' : '') + day + '/' + year;
		}
		if(start === 'today'){
			return [formatDate(Date.now())];
		}
		if(start.getTime() > end.getTime()){
			return -1;
		}
		let dateList = [];
		for (var d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
	    	dateList.push(formatDate(new Date(d)));
		}
		return dateList;
	}
}

module.exports = DateParser;