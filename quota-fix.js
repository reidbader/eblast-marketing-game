// Reduce Google Sheets write quota usage and show user-friendly rate-limit errors.
(function(){
  function sheetRange(field,row){
    const m=map();
    return "'"+CFG.sheetName.replaceAll("'","''")+"'!"+col(m[field]+1)+row.sheetRow;
  }

  async function sendBatch(items){
    if(!accessToken)return false;
    const m=map();
    const data=[];
    items.forEach(({row,updates})=>{
      Object.entries(updates).forEach(([field,value])=>{
        if(m[field]!=null)data.push({range:sheetRange(field,row),values:[[value]]});
      });
    });
    const resp=await fetch(
      "https://sheets.googleapis.com/v4/spreadsheets/"+encodeURIComponent(CFG.spreadsheetId)+"/values:batchUpdate",
      {
        method:"POST",
        headers:{Authorization:"Bearer "+accessToken,"Content-Type":"application/json"},
        body:JSON.stringify({valueInputOption:"RAW",data})
      }
    );
    if(!resp.ok){
      if(resp.status===429){
        alert("Google Sheets is receiving updates too quickly. Your last tap was not saved. Try again in about a minute.");
      }else{
        alert("Could not save this update to Google Sheets. Please try again.");
      }
      return false;
    }
    items.forEach(({row,updates})=>Object.entries(updates).forEach(([field,value])=>setVal(row,field,value)));
    return true;
  }

  // Replace normal single-card writes with the same one-request batch endpoint,
  // but do not expose Google's raw error JSON to the user.
  window.writeFields=async function(row,updates){
    if(!row)return false;
    return sendBatch([{row,updates}]);
  };

  // Hot or Not used to make two separate HTTP writes per matchup.
  // Both cards now save atomically in a single Sheets API write request.
  window.chooseCompare=async function(side){
    if(comparePair.length<2)return;
    const winner=comparePair[side],loser=comparePair[side===0?1:0],now=new Date().toISOString();
    const snapW=snapshot(winner),snapL=snapshot(loser);
    const winUpdates={"Points":String(score(winner)+5),"Status":"Reviewed","Reviewed Date":val(winner,"Reviewed Date")||now};
    const loseUpdates={"Points":String(score(loser)-5),"Status":"Reviewed","Reviewed Date":val(loser,"Reviewed Date")||now};
    if(!await sendBatch([{row:winner,updates:winUpdates},{row:loser,updates:loseUpdates}]))return;
    actionHistory.push({compare:true,winner:snapW,loser:snapL});
    render();
    renderCompare();
  };
})();
