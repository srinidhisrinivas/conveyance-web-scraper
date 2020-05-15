<!-- :: Batch section
@echo off
setlocal

echo Select an option:
for /F "delims=" %%a in ('mshta.exe "%~F0"') do set "HTAreply=%%a"
echo End of HTA window, reply: "%HTAreply%"
goto :EOF
-->


<HTML>
<HEAD>
<HTA:APPLICATION SCROLL="no" SYSMENU="no" >

<TITLE>HTA Buttons</TITLE>
<SCRIPT language="JavaScript">
window.resizeTo(374,500);

function closeHTA(reply){
   var fso = new ActiveXObject("Scripting.FileSystemObject");
   fso.GetStandardStream(1).WriteLine(reply);
   window.close();
}
function ReadFile(){
	var fso = new ActiveXObject("Scripting.FileSystemObject");
	var fileStream = fso.OpenTextFile("user_config.json");
	return JSON.parse(fileStream.ReadAll());
}
function load(){
	document.getElementById('text').innerText = ReadFile();
}

</SCRIPT>
</HEAD>
<BODY onload="load()">
	<p id="text"> </p>
   <button onclick="closeHTA(1);">First option</button>
   <button onclick="closeHTA(2);">Second option</button>
   <button onclick="closeHTA(3);">Third option</button>
</BODY>
</HTML>