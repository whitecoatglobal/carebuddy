import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createCanvas,loadImage,GlobalFonts} from '@napi-rs/canvas';

const root=fileURLToPath(new URL('../',import.meta.url));
const build=path.join(root,'.build'),out=path.join(root,'materials');
const inputs=path.join(root,'inputs'),publicDir=path.join(root,'public');
const timeline=JSON.parse(await fs.readFile(path.join(inputs,'caption-timeline.json'),'utf8'));
const story=JSON.parse(await fs.readFile(path.join(inputs,'story.json'),'utf8'));
const W=1920,H=1080,FPS=15;
const brandSymbol=await loadImage(path.join(publicDir,'branding/carebuddy-symbol-v1.png'));
const brandWordmark=await loadImage(path.join(publicDir,'branding/carebuddy-wordmark-v1.png'));
GlobalFonts.registerFromPath(path.join(publicDir,'fonts/Fraunces.ttf'),'Fraunces');
GlobalFonts.registerFromPath(path.join(publicDir,'fonts/DM-Sans.ttf'),'DM Sans');
const C={cream:'#FAF6F0',sand:'#EADFCF',sage:'#8FB39F',deep:'#4F7A66',plum:'#3A3745'};
const mapping=[
 ['01-landing','01-landing','02-today-weather','09-family','02-today-weather','16-buddy-saved'],
 ['02-today-weather','02-today-weather','02-today-weather','02-today-weather','03-today-routines','17-today-updated','17-today-updated','17-today-updated'],
 ['04-sleep-review','05-sleep-stages','06-sleep-explained','04-sleep-review','08-health-vitals','07-health-review','08-health-vitals','07-health-review'],
 ['09-family','10-mom-care','12-appointment','12-appointment','13-benefits','13-benefits','11-mom-routines-appointment'],
 ['16-buddy-saved','16-buddy-saved','16-buddy-saved','16-buddy-saved','16-buddy-saved','16-buddy-saved','17-today-updated','16-buddy-saved','17-today-updated','16-buddy-saved'],
 ['18-gp-handoff','18-gp-handoff','18-gp-handoff','18-gp-handoff','18-gp-handoff','18-gp-handoff'],
 ['20-integrations','21-integrations-scope','21-integrations-scope','22-integrations-explained','22-integrations-explained','22-integrations-explained','21-integrations-scope','22-integrations-explained','22-integrations-explained'],
 ['architecture-2','architecture-2','architecture-2','architecture-3','architecture-3','architecture-3','architecture-4','architecture-5','architecture-5'],
 ['proof-01','proof-02','proof-03','16-buddy-saved','architecture-3','proof-03','01-landing','01-landing','01-landing']
];
const proofs={
 'proof-01':path.join(out,'codebuddy-evidence/01-codebuddy-ui-redesign.png'),
 'proof-02':path.join(out,'codebuddy-evidence/02-codebuddy-backend-onboarding.jpg'),
 'proof-03':path.join(out,'codebuddy-evidence/03-codebuddy-brand-fonts.png')
};
const pictures=new Map();
for(const name of new Set(mapping.flat())){
 const file=proofs[name]??(name.startsWith('architecture-')?path.join(inputs,'architecture','slide-'+name.split('-')[1]+'.png'):path.join(inputs,'captures',name+'.png'));
 pictures.set(name,await loadImage(file));
}
const frameDir=path.join(build,'side-caption-frames'),qaDir=path.join(build,'video-side-qa');
await fs.mkdir(frameDir,{recursive:true});await fs.mkdir(qaDir,{recursive:true});
const canvas=createCanvas(W,H),ctx=canvas.getContext('2d');
ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
function wrap(text,width,maxLines){
 const lines=[];let line='';
 for(const word of text.split(/\s+/)){
  const next=line?line+' '+word:word;
  if(line&&ctx.measureText(next).width>width){lines.push(line);line=word;}else line=next;
 }
 if(line)lines.push(line);
 if(lines.length>maxLines)throw new Error('Caption exceeds layout: '+text);
 return lines;
}
function lines(text,x,y,width,size,leading,family,color,maxLines){
 ctx.font=size+'px '+family;ctx.fillStyle=color;
 const rows=wrap(text,width,maxLines);
 for(let n=0;n<rows.length;n++)ctx.fillText(rows[n],x,y+n*leading);
 return {bottom:y+rows.length*leading,count:rows.length};
}
function clock(seconds){return Math.floor(seconds/60).toString().padStart(2,'0')+':'+Math.floor(seconds%60).toString().padStart(2,'0');}
const checks=[],ffconcat=['ffconcat version 1.0'];
for(let i=0;i<timeline.sentences.length;i++){
 const sentence=timeline.sentences[i],chapterPictures=mapping[sentence.chapter];
 const name=chapterPictures[Math.min(sentence.sentence,chapterPictures.length-1)];
 const wide=name.startsWith('architecture-')||name.startsWith('proof-');
 const image=pictures.get(name);
 ctx.fillStyle=C.cream;ctx.fillRect(0,0,W,H);ctx.textAlign='left';ctx.textBaseline='top';
 ctx.save();ctx.globalCompositeOperation='multiply';
 const symbolH=62,symbolW=symbolH*brandSymbol.width/brandSymbol.height;
 const wordH=55,wordW=wordH*brandWordmark.width/brandWordmark.height;
 ctx.drawImage(brandSymbol,80,20,symbolW,symbolH);
 ctx.drawImage(brandWordmark,80+symbolW+12,23.5,wordW,wordH);
 ctx.restore();
 ctx.textAlign='right';ctx.font='26px "DM Sans"';ctx.fillStyle=C.deep;
 ctx.fillText('Healthcare Track · Case Study 2',1840,42);ctx.textAlign='left';
 ctx.fillStyle=C.sand;ctx.fillRect(80,98,1760,2);
 const media=wide?{x:80,y:150,w:1040,h:810}:{x:80,y:132,w:480,h:888};
 ctx.fillStyle=C.sand;ctx.beginPath();ctx.roundRect(media.x,media.y,media.w,media.h,24);ctx.fill();
 const scale=Math.min((media.w-28)/image.width,(media.h-28)/image.height);
 const iw=image.width*scale,ih=image.height*scale;
 ctx.drawImage(image,media.x+(media.w-iw)/2,media.y+(media.h-ih)/2,iw,ih);
 const textX=wide?1190:660,width=wide?650:1080;
 const titleSize=wide?52:76,titleLead=wide?61:85;
 lines(String(sentence.chapter+1).padStart(2,'0')+' / '+String(story.length).padStart(2,'0'),textX,158,width,27,34,'"DM Sans"',C.deep,1);
 const title=lines(story[sentence.chapter].chapter,textX,215,width,titleSize,titleLead,'Fraunces',C.plum,3);
 const subtitle=lines(story[sentence.chapter].label,textX,title.bottom+20,width,wide?25:30,wide?34:39,'"DM Sans"',C.deep,3);
 const captionY=Math.max(wide?445:520,subtitle.bottom+62);
 ctx.fillStyle=C.sage;ctx.fillRect(textX,captionY-30,72,4);
 const caption=lines(sentence.text,textX,captionY,width,wide?38:50,wide?51:66,'"DM Sans"',C.plum,wide?8:6);
 if(caption.bottom>947)throw new Error('Caption overlaps footer: '+sentence.text);
 lines(name.startsWith('proof-')?'Historical CodeBuddy development capture':'Actual website captures · Fictional care records',textX,978,width,wide?22:25,32,'"DM Sans"',C.deep,2);
 ctx.textAlign='right';ctx.font='23px "DM Sans"';ctx.fillText(clock(sentence.start)+' / 05:58',1840,1023);ctx.textAlign='left';
 ctx.fillStyle=C.sand;ctx.fillRect(80,1054,1760,5);
 ctx.fillStyle=C.deep;ctx.fillRect(80,1054,1760*(sentence.start/timeline.duration),5);
 const file=path.join(frameDir,String(i+1).padStart(3,'0')+'.png');
 await fs.writeFile(file,canvas.toBuffer('image/png'));
 const duration=(timeline.sentences[i+1]?.start??timeline.duration)-sentence.start;
 ffconcat.push("file '"+file+"'",'duration '+duration.toFixed(8));
 for(const sec of [3,70,120,155,185,240,275,290,307,340])if(sentence.start<=sec&&sentence.start+duration>sec)await fs.copyFile(file,path.join(qaDir,'frame-'+sec+'.png'));
 checks.push({sentence:i+1,picture:name,titleLines:title.count,captionLines:caption.count,captionBottom:caption.bottom,start:sentence.start,end:sentence.start+duration});
}
ffconcat.push("file '"+path.join(frameDir,String(timeline.sentences.length).padStart(3,'0')+'.png')+"'");
await fs.writeFile(path.join(build,'side-caption-frames.ffconcat'),ffconcat.join('\n')+'\n');
await fs.writeFile(path.join(build,'side-caption-layout-checks.json'),JSON.stringify({dimensions:[W,H],sentences:checks},null,2));
console.log('Prepared '+checks.length+' caption frames; mobile screens remain unchanged.');
if(process.argv.includes('--frames-only'))process.exit(0);
const video=path.join(publicDir,'Care-Buddy-Mobile-Demo-v3.mp4');
const args=['-hide_banner','-loglevel','warning','-y','-f','concat','-safe','0','-i',path.join(build,'side-caption-frames.ffconcat'),'-i',path.join(build,'soft-background.wav'),'-map','0:v:0','-map','1:a:0','-vf','fps='+FPS,'-t',String(timeline.duration),'-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-ar','48000','-movflags','+faststart','-shortest','-metadata','title=Care Buddy - Mobile Demo with Side Captions','-metadata','comment=Actual mobile website captures with side captions and original soft instrumental music. No speech. Fictional care data.','-progress',path.join(build,'video-side-progress.txt'),video];
const encoder=spawn(process.env.FFMPEG_BIN || 'ffmpeg',args,{stdio:['ignore','ignore','pipe']});
let stderr='';encoder.stderr.on('data',chunk=>{stderr+=chunk.toString();if(stderr.length>10000)stderr=stderr.slice(-10000);});
const [code]=await once(encoder,'exit');
if(code!==0)throw new Error('Encoding failed: '+stderr);
await fs.copyFile(path.join(frameDir,'001.png'),path.join(publicDir,'Care-Buddy-Demo-Poster-v3.png'));
console.log('Video ready:',video);
