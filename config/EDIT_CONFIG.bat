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

<TITLE>Edit User Config</TITLE>
<SCRIPT language="JavaScript">
window.resizeTo(500,660);

function closeHTA(){
   window.close();
}

function ReadFile(){
	
   var JSON = new ActiveXObject("Chilkat_9_5_0.JsonObject");
	JSON.LoadFile("user_config.json");
   return JSON;
}
function load(){
   var JSON = ReadFile();
	document.getElementById("dir").value = JSON.StringOf("TARGET_DIR");
   var codesString = new ActiveXObject("Chilkat_9_5_0.StringBuilder");
   JSON.ArrayOf("VALID_CONV_CODES").EmitSb(codesString);
   var filterString = new ActiveXObject("Chilkat_9_5_0.StringBuilder");
   JSON.ArrayOf("NAME_FILTER_WORDS").EmitSb(filterString);
   var exceptionString = new ActiveXObject("Chilkat_9_5_0.StringBuilder");
   JSON.ArrayOf("TITLECASE_EXCEPTIONS").EmitSb(exceptionString);
   document.getElementById("codes").value = codesString.GetAsString().replace(/[\[\]]/g,"");
   document.getElementById("filter").value = filterString.GetAsString().replace(/[\[\]]/g,"");
   document.getElementById("exception").value = exceptionString.GetAsString().replace(/[\[\]]/g,"").toUpperCase();
}

function stringToJarr(str){

   /**
   var arr = str.split(",");
   for(var i = 0; i < arr.length; i++){
      arr[i] = "\"" + arr[i] + "\"";
   }
   str = arr.join(",");
   **/
   var jarr = new ActiveXObject("Chilkat_9_5_0.JsonArray");
   if(str.charAt(0) !== "[") str = "[" + str + "]";
   jarr.Load(str);
   return jarr;
}

function restore(){
   var JSON = ReadFile();
   var defDir = JSON.StringOf("DEFAULT_TARGET_DIR");
   var codesString = new ActiveXObject("Chilkat_9_5_0.StringBuilder");
   JSON.ArrayOf("DEFAULT_VALID_CONV_CODES").EmitSb(codesString);
   var filterString = new ActiveXObject("Chilkat_9_5_0.StringBuilder");
   JSON.ArrayOf("DEFAULT_NAME_FILTER_WORDS").EmitSb(filterString);
   var exceptionString = new ActiveXObject("Chilkat_9_5_0.StringBuilder");
   JSON.ArrayOf("DEFAULT_TITLECASE_EXCEPTIONS").EmitSb(exceptionString);

   JSON.UpdateString("TARGET_DIR", defDir);

   JSON.Delete("VALID_CONV_CODES");
   JSON.AddArrayCopyAt(-1,"VALID_CONV_CODES", stringToJarr(codesString.GetAsString()));
   
   JSON.Delete("NAME_FILTER_WORDS");
   JSON.AddArrayCopyAt(-1,"NAME_FILTER_WORDS", stringToJarr(filterString.GetAsString()));

   JSON.Delete("TITLECASE_EXCEPTIONS");
   JSON.AddArrayCopyAt(-1,"TITLECASE_EXCEPTIONS", stringToJarr(exceptionString.GetAsString()));

   JSON.WriteFile("user_config.json");  
   closeHTA();
   return; 
}

function update(){
   var JSON = ReadFile();
   var FS = new ActiveXObject("Scripting.FileSystemObject");
   var dir = document.getElementById("dir").value;

   var convCodes = stringToJarr(document.getElementById("codes").value);
   var filterWords = stringToJarr(document.getElementById("filter").value);
   var exceptionWords = stringToJarr(document.getElementById("exception").value.toLowerCase());

   if(!FS.FolderExists(dir)){
      document.getElementById("dir-description").innerText = "ERROR: This folder does not exist";
   } else {
      document.getElementById("dir-description").innerText = "New Folder Saved!";
      document.getElementById("codes-description").innerText = "New Codes Saved!";
      document.getElementById("filter-description").innerText = "New Filter Words Saved!";
      document.getElementById("exception-description").innerText = "New Exception Words Saved!";


      JSON.UpdateString("TARGET_DIR", dir);

      JSON.Delete("VALID_CONV_CODES");
      JSON.AddArrayCopyAt(-1,"VALID_CONV_CODES", convCodes)
      
      JSON.Delete("NAME_FILTER_WORDS");
      JSON.AddArrayCopyAt(-1,"NAME_FILTER_WORDS", filterWords);

      JSON.Delete("TITLECASE_EXCEPTIONS");
      JSON.AddArrayCopyAt(-1,"TITLECASE_EXCEPTIONS", exceptionWords);
      
      JSON.WriteFile("user_config.json");   
   }
   closeHTA();
   return;   
}

</SCRIPT>
</HEAD>
<BODY onload="load()">
	<div class="input-label" id="dir-label" style="font-weight: 400;"> Destination Folder: </div> <br>
   <input type="text" id="dir" style="width: 450px;"> <br>
   <div class="input-label" id="dir-description" style="font-size: 8pt;"> Copy and Paste the full path of the destination </div> <br>
   <div class="input-label" id="codes-label" style="font-weight: 400;"> Valid Conveyance Codes: </div> <br>
   <textarea id="codes" style="width: 450px; height:75px"> </textarea> <br>
   <div class="input-label" id="codes-description" style="font-size: 8pt;"> Add the Conveyance Codes that you want to filter. Put within double quotes. Separate by commas. </div> <br>
   <div class="input-label" id="filter-label" style="font-weight: 400;"> Owner Name Filter Words: </div> <br>
   <textarea id="filter" style="width: 450px; height:75px"> </textarea> <br>
   <div class="input-label" id="filter-description" style="font-size: 8pt;"> These are words which, if found in the owner's name, will cause the name to remain the same without changing the order of any words. Put within double quotes. Separate by commas. </div> <br>
   <div class="input-label" id="exception-label" style="font-weight: 400;"> Case Exception Words: </div> <br>
   <textarea id="exception" style="width: 450px; height:75px"> </textarea> <br>
   <div class="input-label" id="exception-description" style="font-size: 8pt;"> These are words which will remain capitalized. Put within double quotes. Separate by commas. </div> <br>
   <button onclick="closeHTA();">Close</button>
   <button onclick="update();">Save</button>
   <button onclick="restore();">Restore Defaults </button>
</BODY>
</HTML>