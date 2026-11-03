/* Original web implementation of traditional rules; reference: cyber-divination-notice.md. */
(function () {
  'use strict';
  const NAMES = ['大安','留连','速喜','赤口','小吉','空亡'];
  const BRANCHES = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
  const ANIMALS = ['鼠','牛','虎','兔','龙','蛇','马','羊','猴','鸡','狗','猪'];
  const DIRECTIONS = ['正北','东北','东北','正东','东南','东南','正南','西南','西南','正西','西北','西北'];
  const THEMES = [
    ['安稳守成','传统象意是安定与踏实。把已经开始的事做好，留一点从容给自己。'],
    ['慢一点也无妨','传统象意是等待与反复。先理清卡住的环节，不必催自己立刻得到答案。'],
    ['留意好消息','传统象意是喜讯与行动。把准备做在前面，遇到机会时更容易接住。'],
    ['说话留些余地','传统象意是口舌与分歧。先核实，再回应；换一种说法，往往就有新路。'],
    ['小步向前','传统象意是和合与小有进展。用一次认真沟通或一个小行动，推动事情往前走。'],
    ['给计划留白','传统象意是落空与调整。先降低不必要的期待，留意遗漏，也给自己重新安排的空间。']
  ];
  const ADVICE = {
    daily:['按熟悉的节奏安排今天，先完成一件确定的小事。','把待办拆小，给最慢的一步预留时间。','把一直想做的小事提上日程。','遇到不同意见时，先问清楚对方在担心什么。','找一个愿意配合的人，一起完成小目标。','检查计划里有没有遗漏，今天也可以留一点空白。'],
    work:['沿用有效的方法，认真收尾。','确认需求和截止时间，减少反复返工。','主动跟进已经准备好的任务。','用事实和清楚的文字对齐需求。','把大目标拆成可完成的小步骤。','重新确认优先级，必要时请求帮助。'],
    love:['把关心落在具体的小事上，给关系一些稳定感。','不急着替对方下结论，找合适的时机聊聊。','可以发出一次轻松的邀请，也尊重对方的回应。','争执时先暂停，把指责换成自己的感受。','一起做一件普通的小事，慢慢增加了解。','关注自己的感受和边界，不用靠一支卦决定去留。'],
    travel:['确认路线与随身物品，按计划出发。','预留换乘和等候时间。','出发前把行程信息确认一遍。','与同行的人提前说清安排。','留出可调整的时间，同行时互相照应。','再检查天气、预约和交通信息。'],
    lost:['从最熟悉、最近停留的地方找起。','按时间顺序回想，不要反复翻同一个角落。','问问最近同行的人，也检查常用收纳处。','先确认物品最后出现的时间和地点。','请熟悉环境的人一起帮忙寻找。','查找失物招领，并及时处理必要的挂失。']
  };
  function integer(value,min,max) {
    if (!Number.isInteger(value)||value<min||value>max) throw new RangeError('请选择有效的月份、日期或时辰。');
    return value;
  }
  function liuren(month,day,hour) {
    integer(month,1,12);integer(day,1,30);integer(hour,1,12);
    const monthIndex=(month-1)%6,dayIndex=(monthIndex+day-1)%6,index=(dayIndex+hour-1)%6;
    return {index,name:NAMES[index],steps:[NAMES[monthIndex],NAMES[dayIndex],NAMES[index]]};
  }
  function hourIndex(hour) { return Math.floor((integer(hour,0,23)+1)/2)%12+1; }
  function beijingDate(now) {
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
    const part=type=>parts.find(p=>p.type===type).value;
    return part('year')+'-'+part('month')+'-'+part('day');
  }
  function currentLunar(now) {
    const parts=new Intl.DateTimeFormat('en-u-ca-chinese',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric'}).formatToParts(now);
    const monthText=parts.find(p=>p.type==='month').value;
    const month=parseInt(monthText,10),day=Number(parts.find(p=>p.type==='day').value);
    integer(month,1,12);integer(day,1,30);
    const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',hour:'2-digit',hourCycle:'h23'}).format(now));
    return {month,day,hour:hourIndex(hour),leap:/bis|闰/.test(monthText)};
  }
  function signNumber(name,question,date) {
    const clean=s=>s.normalize('NFKC').trim().replace(/\s+/g,' ');
    const text=JSON.stringify([clean(name),clean(question),date]);
    let hash=2166136261;
    for (const char of text) hash=Math.imul(hash^char.codePointAt(0),16777619)>>>0;
    return hash%100+1;
  }
  function zodiac(a,b) {
    integer(a,0,11);integer(b,0,11);
    const pair=groups=>groups.some(g=>a!==b&&g.includes(a)&&g.includes(b));
    if(pair([[0,1],[2,11],[3,10],[4,9],[5,8],[6,7]]))return ['六合','传统配对中的相合组合。可以把它当作一个轻松的开场话题，真正的默契仍来自相处。'];
    if(pair([[0,4,8],[2,6,10],[1,5,9],[3,7,11]]))return ['三合','传统配对中的相合组合。多发现彼此的共同兴趣，也给不同习惯留些空间。'];
    if(Math.abs(a-b)===6)return ['六冲','传统上把这组称为相冲，象征差异。差异不等于不合适，试着把各自的需求说具体。'];
    if(pair([[0,7],[1,6],[2,5],[3,4],[8,11],[9,10]]))return ['六害','传统上把这组称为相害。把它当作沟通提醒即可，生肖不能决定一段关系的结果。'];
    return [a===b?'同生肖':'平和相配','在这四类规则中没有额外的相合或冲害判断。是否适合，还是看彼此的尊重、信任和相处。'];
  }
  function direction(month,day) {
    integer(month,1,12);integer(day,1,30);
    const start=(month+1)%12,index=(start+day-1)%12;
    return {start:BRANCHES[start],branch:BRANCHES[index],direction:DIRECTIONS[index]};
  }
  const api={liuren,hourIndex,beijingDate,currentLunar,signNumber,zodiac,direction};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(typeof document==='undefined')return;
  const $=id=>document.getElementById(id);
  function options(id,values) {
    values.forEach(([value,label])=>{const option=document.createElement('option');option.value=value;option.textContent=label;$(id).append(option);});
  }
  for(const id of ['lunarMonth','birthMonth'])options(id,Array.from({length:12},(_,i)=>[i+1,(i+1)+'月']));
  for(const id of ['lunarDay','birthDay'])options(id,Array.from({length:30},(_,i)=>[i+1,(i+1)+'日']));
  options('lunarHour',BRANCHES.map((name,i)=>[i+1,name+'时 · '+(i===0?'23:00–01:00':String(i*2-1).padStart(2,'0')+':00–'+String(i*2+1).padStart(2,'0')+':00')]));
  for(const id of ['zodiacA','zodiacB'])options(id,ANIMALS.map((name,i)=>[i,name]));
  $('zodiacB').value='1';
  function useNow() {
    try {
      const value=currentLunar(new Date());
      $('lunarMonth').value=value.month;$('lunarDay').value=value.day;$('lunarHour').value=value.hour;
      $('lunarNote').textContent='已填入北京时间 '+beijingDate(new Date())+' · 农历'+(value.leap?'闰':'')+value.month+'月'+value.day+'日。闰月按同月数；23:00 起算子时，农历日期仍取当天。';
    } catch { $('lunarNote').textContent='当前浏览器无法自动换算农历，请手动选择农历月、日和时辰。'; }
  }
  useNow();$('useNow').addEventListener('click',useNow);
  for(const id of ['lunarMonth','lunarDay','lunarHour'])$(id).addEventListener('change',()=>{$('lunarNote').textContent='已手动选择农历时间。闰月按同月数；每一步都从当前落点算第一位。';});
  document.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>{
    document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
    document.querySelectorAll('[data-panel]').forEach(panel=>panel.hidden=panel.dataset.panel!==button.dataset.mode);
    $('result').hidden=true;$('error').hidden=true;
  }));
  function result(title,eyebrow,body,detail,poem) {
    const box=$('result');box.replaceChildren();
    function add(tag,text,className) {const el=document.createElement(tag);el.textContent=text;if(className)el.className=className;box.append(el);}
    add('div',eyebrow,'eyebrow');add('h2',title);if(poem)add('p',poem,'poem');add('p',body);add('p',detail,'detail');box.hidden=false;
  }
  function bind(form,action) { $(form).addEventListener('submit',event=>{
    event.preventDefault();$('error').hidden=true;
    try {action();} catch(error){$('error').textContent=error.message;$('error').hidden=false;$('result').hidden=true;}
  }); }
  bind('liurenForm',()=>{
    const month=Number($('lunarMonth').value),day=Number($('lunarDay').value),hour=Number($('lunarHour').value),reading=liuren(month,day,hour);
    const question=$('liurenQuestion').value.trim();
    result(reading.name+' · '+THEMES[reading.index][0],question||'小六壬 · 农历'+month+'月'+day+'日 · '+BRANCHES[hour-1]+'时',THEMES[reading.index][1]+' '+ADVICE[$('topic').value][reading.index], '推算过程：月落 '+reading.steps[0]+' → 日落 '+reading.steps[1]+' → 时落 '+reading.steps[2]+'。每一步都从当前落点算第一位；问题文字只作记录。');
  });
  bind('signForm',()=>{
    const name=$('signName').value.trim(),question=$('signQuestion').value.trim();
    if(!name||!question)throw new Error('请填写昵称和想问的问题。');
    const date=beijingDate(new Date()),number=signNumber(name,question,date),sign=globalThis.DIVINATION_SIGNS?.[number-1];
    if(!sign)throw new Error('签诗未加载，请刷新页面后再试。');
    result('第 '+number+' 签 · '+sign.grade,name+' · '+date+' · '+question,'签诗是给这段心事的一种故事视角。无论抽到什么，都可以把下一步放在真诚沟通、照顾自己和尊重彼此上。','同一昵称和问题，当天保持同一签；不会根据你输入的问题生成事实预测。',sign.poem);
  });
  bind('zodiacForm',()=>{
    const a=Number($('zodiacA').value),b=Number($('zodiacB').value),reading=zodiac(a,b);
    result(ANIMALS[a]+' × '+ANIMALS[b]+' · '+reading[0],'生肖简配',reading[1],'这里只比较生肖的四类传统关系，不等同于完整八字合婚。');
  });
  bind('directionForm',()=>{
    const month=Number($('birthMonth').value),day=Number($('birthDay').value),reading=direction(month,day);
    result(reading.direction+' · '+reading.branch+'位','姻缘方位 · 农历生日 '+month+'月'+day+'日','按传统掌中诀，这个生日落在'+reading.direction+'。把它当作一次有趣的方位联想，遇见谁仍取决于真实的生活与交往。','推算过程：'+month+'月从'+reading.start+'位起，把起点作为初一，顺数到'+day+'日，落'+reading.branch+'位。参考中心为出生地。');
  });
}());
