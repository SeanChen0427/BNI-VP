"""Prepare the verified blank regional form outside the repository. Never accepts a filled case."""
import argparse, base64, hashlib, json, re
from pathlib import Path
from zipfile import ZipFile
from lxml import etree as E

p=argparse.ArgumentParser()
p.add_argument('--source-doc',required=True)
p.add_argument('--converted-docx',required=True)
p.add_argument('--output-dir',required=True)
a=p.parse_args()
root=Path(__file__).resolve().parents[1];out=Path(a.output_dir).resolve()
if out==root or root in out.parents:raise SystemExit('Template originals and packages must remain outside the repository')
source=Path(a.source_doc);converted=Path(a.converted_docx)
expected='5c6c5ce84936cf1cedd56cb3c93651ef0d946be6af4cc7fb0e0723217277d126'
if hashlib.sha256(source.read_bytes()).hexdigest()!=expected:raise SystemExit('Unreviewed original template: update the version mapping and visual evidence first')
if hashlib.sha256(converted.read_bytes()).hexdigest()!='4a21250cfc5f548149888c2f3faa975ba8c4c1d378df9e7f6e877de1f870c9e3':raise SystemExit('Use the reviewed blank DOCX conversion; filled documents are not template sources')
z=ZipFile(converted);n={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'};W='{'+n['w']+'}'
r=E.fromstring(z.read('word/document.xml'));ps=r.xpath('//w:p',namespaces=n)
def token(key):return '{{'+key+'}}'
def put(i,text):
 ts=ps[i].xpath('.//w:t',namespaces=n)
 if not ts:
  run=ps[i].find(W+'r')
  if run is None:run=E.SubElement(ps[i],W+'r')
  ts=[E.SubElement(run,W+'t')]
 ts[0].text=text;ts[0].set('{http://www.w3.org/XML/1998/namespace}space','preserve')
 for t in ts[1:]:t.text=''
def append(i,key):
 run=ps[i].findall(W+'r')[-1]
 t=E.SubElement(run,W+'t');t.text=token(key);t.set('{http://www.w3.org/XML/1998/namespace}space','preserve')
def replace(i,old,new):
 for t in ps[i].xpath('.//w:t',namespaces=n):
  if t.text and old in t.text:t.text=t.text.replace(old,new);return
 raise ValueError((i,old))
for i,key in [(0,'meetingPlace'),(1,'meetingDate'),(2,'interviewers'),(3,'applicant'),(4,'profession'),(43,'licenses'),(135,'applicant')]:append(i,key)
for start,count,key in [(11,11,'businessContent'),(23,9,'advantages'),(33,4,'representativeClients'),(38,4,'successStories'),(46,2,'joinReason'),(49,2,'cooperationIndustries'),(52,2,'annualGoal'),(115,6,'otherQuestions'),(122,4,'chapterNotes')]:
 for k in range(count):put(start+k,token(f'{key}.{k}'))
replace(42,'□全職 □兼職',token('employmentFull')+'全職 '+token('employmentPart')+'兼職')
replace(42,'        ',token('experienceYears'))
for j,key in [(1,'taxId'),(3,'capital'),(5,'establishedDate')]:ps[44].findall(W+'r')[j].find(W+'t').text=token(key)
for i,key in [(55,'sixHours'),(58,'attendancePromise'),(60,'mentorPlan'),(73,'inviteVisitors'),(78,'trainingSystem'),(80,'mspCommitment'),(83,'newMemberSession'),(86,'greenStandard'),(88,'policyEthics')]:
 # Checkboxes may occur across multiple runs; change only their own nodes.
 for label,suffix in [('是','Yes'),('否','No')]:
  replace(i,'□',token(key+suffix))
for i,key in [(62,'membershipTransfer'),(65,'feeUse'),(69,'attendancePolicy'),(105,'policyFourUnderstood'),(109,'openCategory')]:replace(i,'□',token(key))
replace(56,'         ',token('arrivalTime'))
put(71,token('proxyAvailableYes')+'是 代理人姓名:'+token('proxyName')+'　關係:'+token('proxyRelation')+'，'+token('proxyAvailableNo')+'否 (可能被婉拒入會)')
replace(75,'□',token('applicationCorrectYes'));replace(76,'□',token('applicationCorrectNo'))
put(81,'MSP(上)：'+token('mspUpDate')+' / MSP(下)：'+token('mspDownDate'))
put(84,'新會員交流座談會：'+token('sessionDate1')+' / '+token('sessionDate2'))
replace(89,'____________________________',token('organization'))
replace(95,'□',token('otherOrganizationYes'));replace(96,'□',token('otherOrganizationNo'))
put(111,token('pledgeGuestsYes')+'是 姓名:'+token('guest1Name')+'　　　關係:'+token('guest1Relation'))
put(112,'     姓名:'+token('guest2Name')+'　　　關係:'+token('guest2Relation'))
replace(113,'□',token('pledgeGuestsNo'))
replace(126,'_____________________',token('applicantSignature'))
replace(127,'________________/_________________/__________________',token('witness1')+'/'+token('witness2')+'/'+token('witness3'))
put(128,'中   華   民   國   '+token('signatureYear')+'   年   '+token('signatureMonth')+'   月   '+token('signatureDay')+'   日')
append(134,'chapter')
for k in range(20):put(140+3*k,token(f'contactName{k+1}'));put(141+3*k,token(f'contactIndustry{k+1}'))
main=r.xpath('//w:tbl',namespaces=n)[1];floatpr=main.find('w:tblPr/w:tblpPr',n)
floatpr.getparent().remove(floatpr);main.find('w:tblPr/w:tblInd',n).set(W+'w','-114')
# Word updates PAGE caches on opening; other package parts are untouched.
settings=E.fromstring(z.read('word/settings.xml'));uf=E.SubElement(settings,W+'updateFields');uf.set(W+'val','true')
xml=E.tostring(r,xml_declaration=True,encoding='UTF-8',standalone=True)
parts={item.filename:base64.b64encode(xml if item.filename=='word/document.xml' else E.tostring(settings,xml_declaration=True,encoding='UTF-8',standalone=True) if item.filename=='word/settings.xml' else z.read(item.filename)).decode() for item in z.infolist()}
package={'schema':'fulian.interview-template.v1','templateId':'kp-membership-v8.3-20251022','sourceFilename':source.name,'sourceSha256':expected,'headerVersion':'V8.2','headerDate':'20251022','parts':parts}
out.mkdir(parents=True,exist_ok=True)
target=out/(package['templateId']+'.json');target.write_text(json.dumps(package,ensure_ascii=False,separators=(',',':')));target.chmod(0o600)
print(json.dumps({'path':str(target),'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'slots':len(set(re.findall(rb'\{\{([^{}]+)\}\}',xml)))},ensure_ascii=False))
