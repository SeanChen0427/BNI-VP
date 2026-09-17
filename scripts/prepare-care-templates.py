"""Slot the reviewed blank regional care forms; originals/packages stay private."""
import argparse, base64, hashlib, json, re
from pathlib import Path
from zipfile import ZipFile
from lxml import etree as E
p=argparse.ArgumentParser();p.add_argument('--source-dir',required=True);p.add_argument('--output-dir',required=True);a=p.parse_args()
root=Path(__file__).resolve().parents[1];out=Path(a.output_dir).resolve()
if out==root or root in out.parents:raise SystemExit('Templates must remain outside the repository')
config=[('midterm','kp-midterm-v4-20241121','363留員計畫-期中輔導(GROW)V.4(20241121) (2).docx','12307bba2a51714f520b13800cd6ae290c1609af83b55783490ca27369cdb082'),('renewal','kp-renewal-v2-20251114','363留員計畫-終期輔導V.2(20251114).docx','16e16ce60bf9a4b66fa9300557f9791d9102769b14bc29dd1d4ec6f046a7b3e1'),('departure','kp-departure-v2.1-20230428','離會訪談表2.1版(20230428).docx','774e7a95b2dc4cf8942aea0a6bdfedbc1aafc5ed7c5c82877bc105324eaedf88')]
n={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'};W='{'+n['w']+'}';SPACE='{http://www.w3.org/XML/1998/namespace}space'
for kind,ident,filename,expected in config:
 source=Path(a.source_dir)/filename
 if hashlib.sha256(source.read_bytes()).hexdigest()!=expected:raise SystemExit('Unreviewed template: '+filename)
 z=ZipFile(source);r=E.fromstring(z.read('word/document.xml'));ps=r.xpath('//w:p',namespaces=n)
 def token(key):return '{{'+key+'}}'
 def replace(i,old,new):
  ts=ps[i].xpath('.//w:t',namespaces=n);joined=''.join(t.text or '' for t in ts);start=joined.find(old)
  if start<0:raise ValueError((kind,i,old,joined))
  end=start+len(old);pos=0;inserted=False
  for t in ts:
   value=t.text or '';nxt=pos+len(value)
   if pos<end and nxt>start:
    left=max(0,start-pos);right=min(len(value),end-pos)
    t.text=value[:left]+(new if not inserted else '')+value[right:];t.set(SPACE,'preserve');inserted=True
   pos=nxt
 def put(i,value):
  ts=ps[i].xpath('.//w:t',namespaces=n)
  if not ts:
   run=ps[i].find(W+'r')
   if run is None:run=E.SubElement(ps[i],W+'r')
   ts=[E.SubElement(run,W+'t')]
  ts[0].text=value;ts[0].set(SPACE,'preserve')
  for t in ts[1:]:t.text=''
 def slot(i,key):put(i,token(key))
 def group(start,count,key):
  for k in range(count):slot(start+k,f'{key}.{k}')
 if kind in ('midterm','renewal'):
  for i,key in [(1,'meetingDate'),(3,'chapter'),(5,'member'),(7,'profession'),(9 if kind=='midterm' else 10,'counselors')]:slot(i,key)
 if kind=='midterm':
  for i,key in [(19,'absence'),(23,'substitutes'),(27,'late'),(31,'given'),(35,'received'),(39,'amount'),(43,'visitors'),(47,'education'),(51,'oneToOne')]:slot(i,'metric.'+key)
  slot(21,'scoreNote');slot(25,'periodNote')
  replace(33,'       ',token('metric.givenIn'));ps[33].xpath('.//w:t',namespaces=n)[-1].text+=' '+token('metric.givenOut')
  replace(37,'       ',token('metric.receivedIn'));ps[37].xpath('.//w:t',namespaces=n)[-1].text+=' '+token('metric.receivedOut')
  for key,starts,count in [('goal',[57,60,63,66,69],2),('reality',[74,78,82,86,90],3),('option',[96,100,104,108],3)]:
   for k,start in enumerate(starts):group(start,count,f'{key}_{k}')
  for k,(start,count) in enumerate([(115,3),(119,3),(123,2),(126,3),(130,2),(133,3)]):group(start,count,f'forward_{k}')
  group(138,3,'summary')
  # Floating multi-page tables can hide filled answers in Word renderers.
  # Keep the original grid, borders and widths, but allow the existing rows to flow.
  for node in r.xpath('//w:tblPr/w:tblpPr',namespaces=n):node.getparent().remove(node)
  replace(142,'會員：                      日期：                  ','會員：'+token('memberSignature')+'          日期：'+token('signatureDate'))
  replace(143,'會員委員會簽名：                 /                  ','會員委員會簽名：'+token('counselor')+'        /        '+token('companionCounselor'))
 elif kind=='renewal':
  replace(12,'_______',token('score'));replace(12,'_______',token('light'))
  for i,key in [(12,'trafficPeriod'),(13,'palmsPeriod')]:replace(i,'       年      月 至       年      月',token(key))
  for i,key in [(15,'givenIn'),(16,'givenOut'),(18,'receivedIn'),(19,'receivedOut')]:
   t=ps[i].xpath('.//w:t',namespaces=n)[-1];t.text=(t.text or '')+token('average.'+key)
  for i,key,unit in [(21,'amount','元'),(23,'visitors','人'),(25,'oneToOne','次'),(27,'late','次'),(29,'substitutes','次'),(31,'education','分')]:replace(i,unit,token('average.'+key)+unit)
  for i,key,old in [(34,'given','_______'),(39,'received','_______'),(45,'amount','               '),(50,'visitors','______________'),(54,'oneToOne','_________'),(59,'late','_________'),(59,'early','_________'),(62,'education','_________')]:replace(i,old,token('metric.'+key))
  for i,key in [(35,'givenLow'),(37,'givenHigh'),(40,'receivedLow'),(42,'receivedHigh'),(46,'amountLow'),(48,'amountHigh'),(51,'visitorLow'),(53,'visitorHigh'),(54,'oneToOneLow'),(56,'oneToOneHigh'),(63,'educationLow'),(63,'workshopYes'),(63,'workshopNo'),(44,'receivedBenefitYes'),(44,'receivedBenefitNo'),(58,'oneToOneBenefitYes'),(58,'oneToOneBenefitNo'),(88,'mspUnderstood'),(98,'policyUnderstood')]:replace(i,'□',token(key))
  for i,key in [(36,'givenLowAnswer'),(38,'givenHighAnswer'),(41,'receivedLowAnswer'),(43,'receivedHighAnswer'),(47,'amountLowAnswer'),(49,'amountHighAnswer'),(52,'visitorsLowAnswer'),(55,'oneToOneLowAnswer'),(57,'oneToOneHighAnswer'),(61,'attendanceAnswer'),(64,'educationAnswer'),(67,'leadershipAnswer'),(112,'memberSignature'),(117,'counselor'),(119,'companionCounselor'),(121,'interviewerOpinion')]:slot(i,key)
  for start,count,key in [(69,2,'chapterFeelingAnswer'),(72,2,'bniBenefitAnswer'),(75,2,'midtermGoalAnswer'),(78,2,'midtermSummaryAnswer'),(81,3,'businessSatisfactionAnswer'),(85,3,'nextActionsAnswer'),(92,2,'chapterNotes'),(95,2,'chapterSuggestionAnswer'),(108,3,'summary')]:group(start,count,key)
  t=ps[53].xpath('.//w:t',namespaces=n)[-1];t.text=(t.text or '')+token('visitorsHighAnswer')
  # Keep the visitor option with its added answer, and prevent a blank final page.
  pp=ps[53].find(W+'pPr');E.SubElement(pp,W+'keepLines')
  pp=ps[124].find(W+'pPr');spacing=pp.find(W+'spacing');spacing.set(W+'line','20');spacing.set(W+'before','0');spacing.set(W+'after','0')
  E.SubElement(pp,W+'snapToGrid').set(W+'val','0')
  for tag in ['sz','szCs']:pp.find('w:rPr/w:'+tag,n).set(W+'val','2')
  # The original signature table must remain together when answers add pages.
  for i in range(111,123):
   pp=ps[i].find(W+'pPr')
   if pp is None:pp=E.Element(W+'pPr');ps[i].insert(0,pp)
   if pp.find(W+'keepNext') is None:E.SubElement(pp,W+'keepNext')
  # The combined leadership answer is entered in the existing response area (67).
  replace(89,'      年     月      日',token('mspUp'));replace(89,'      年     月      日',token('mspDown'));replace(90,'_____________________',token('memberSignature'))
 else:
  for i,key,old in [(1,'chapter','_'*24),(2,'member','_'*24),(2,'departureDate','_'*23),(3,'interviewers','_'*24),(3,'meetingDate','_'*23),(19,'presidentSignature','_'*21),(19,'vicePresidentSignature','_'*20),(19,'directorSignature','_'*19)]:replace(i,old,token(key))
  for i,key in [(5,'gains'),(7,'likes'),(9,'training'),(13,'departureReason'),(15,'dislikes'),(17,'improvementAttempts')]:slot(i,key)
  replace(10,'____________________________              _',token('msp'))
  replace(11,'___________________ __________',token('procedure'))
 xml=E.tostring(r,xml_declaration=True,encoding='UTF-8',standalone=True)
 parts={item.filename:base64.b64encode(xml if item.filename=='word/document.xml' else z.read(item.filename)).decode() for item in z.infolist()}
 package={'schema':'fulian.interview-template.v1','templateId':ident,'sourceFilename':filename,'sourceSha256':expected,'parts':parts}
 out.mkdir(parents=True,exist_ok=True);target=out/(ident+'.json');target.write_text(json.dumps(package,ensure_ascii=False,separators=(',',':')));target.chmod(0o600)
 print(json.dumps({'type':kind,'id':ident,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'sourceSha256':expected,'slots':len(set(re.findall(rb'\{\{([^{}]+)\}\}',xml)))},ensure_ascii=False))
