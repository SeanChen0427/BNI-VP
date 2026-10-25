"""Prepare the two reviewed V1.1 renewal originals outside the repository."""
import argparse, base64, hashlib, json, re
from pathlib import Path
from zipfile import ZipFile
from lxml import etree as E

p=argparse.ArgumentParser()
p.add_argument('--source-dir',required=True)
p.add_argument('--converted-dir',required=True)
p.add_argument('--output-dir',required=True)
a=p.parse_args()
root=Path(__file__).resolve().parents[1];out=Path(a.output_dir).resolve()
if out==root or root in out.parents:raise SystemExit('Private templates must remain outside the repository')
ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'};W='{'+ns['w']+'}'
specs=[('interview','高屏區會員續約訪談表V.1.1_20261012','7113a0e133dea14c044a1b6ccd653175d2c469a0cdbcdf5be54f8700560e6214','363f2ae6adc3391e1d23ef195dc9faeff845ff674c123dd4e9ad378a94ec498b','kp-renewal-interview-v1.1-20261012'),('assessment','高屏區續約會員委員會內部評估表V.1.1_20261012','e7f7116b594f5959ddb8d4a6c814f55a446df933a6a9a9193e8d85e428fc30dd','658091eef5536b219e72397d028d22bca8fc33ac2da93b6994070c6c44e914c0','kp-renewal-assessment-v1.1-20261012')]
for kind,stem,source_sha,docx_sha,template_id in specs:
 source=Path(a.source_dir)/(stem+'.doc');converted=Path(a.converted_dir)/(stem+'.docx')
 if hashlib.sha256(source.read_bytes()).hexdigest()!=source_sha or hashlib.sha256(converted.read_bytes()).hexdigest()!=docx_sha:raise SystemExit('Unreviewed original or conversion: '+kind)
 z=ZipFile(converted);r=E.fromstring(z.read('word/document.xml'));ps=r.xpath('//w:p',namespaces=ns)
 def token(key):return '{{'+key+'}}'
 def replace(i,old,new):
  ts=ps[i].xpath('.//w:t',namespaces=ns);full=''.join(t.text or '' for t in ts);start=full.index(old);end=start+len(old);offset=0;inserted=False
  for t in ts:
   value=t.text or '';left=max(start-offset,0);right=min(end-offset,len(value))
   if left<right:
    t.text=value[:left]+(new if not inserted else '')+value[right:];t.set('{http://www.w3.org/XML/1998/namespace}space','preserve');inserted=True
   offset+=len(value)
 def append(i,key):
  runs=ps[i].findall(W+'r');run=runs[-1] if runs else E.SubElement(ps[i],W+'r');t=E.SubElement(run,W+'t');t.text=token(key);t.set('{http://www.w3.org/XML/1998/namespace}space','preserve')
 def blank(i,key):
  assert not ''.join(ps[i].xpath('.//w:t/text()',namespaces=ns)).strip(),i
  append(i,key)
 def boxes(i,keys):
  for key in keys:replace(i,'□',token(key))
 if kind=='interview':
  for i,key in [(1,'member'),(2,'chapter'),(3,'profession'),(4,'meetingDate'),(5,'counselors'),(6,'activation'),(7,'expiryDate')]:append(i,key)
  boxes(8,['cycle1','cycle2','cycle3'])
  replace(15,'       次/      次',token('metric.absence')+'次/'+token('metric.substitutes')+'次')
  for i,key in [(19,'oneToOne'),(23,'education'),(27,'visitors'),(31,'referrals')]:
   suffix=''.join(ps[i].xpath('.//w:t/text()',namespaces=ns));replace(i,suffix,token('metric.'+key)+suffix)
  append(35,'metric.amountGiven');append(36,'metric.amountReceived')
  for i,key in [(21,'oneToOneStatus'),(25,'educationStatus'),(29,'visitorsStatus'),(33,'referralsStatus'),(89,'chapterVisitorsStatus')]:boxes(i,[key+'Met',key+'Unmet'])
  boxes(39,['eventInw','eventTaiwan','eventInternational']);replace(39,'                 ',token('eventCountry'))
  for i,keys in [(42,[f'gain{i}' for i in range(1,6)]),(43,[f'gain{i}' for i in range(6,10)]),(44,['gainOtherSelected']),(57,[f'usageScore{i}' for i in range(5,0,-1)]),(65,[f'underused{i}' for i in range(1,6)]),(66,[f'underused{i}' for i in range(6,11)]),(67,['underusedOtherSelected']),(76,[f'partnerStatus{i}' for i in range(1,5)]),(84,[f'advocates{i}' for i in range(1,5)]),(90,['growthHigh','growthMedium','growthLow']),(97,[f'visitorBarrier{i}' for i in range(1,5)]),(98,[f'visitorBarrier{i}' for i in range(5,8)]),(99,['visitorBarrierOtherSelected']),(135,[f'value{i}' for i in range(1,5)]),(136,[f'value{i}' for i in range(5,8)]),(137,['valueOtherSelected']),(140,[f'culture{i}' for i in range(1,5)]),(142,[f'teamSupport{i}' for i in range(1,4)]),(144,[f'trust{i}' for i in range(1,4)]),(154,['mspUnderstood'])]:boxes(i,keys)
  for i,key in [(44,'gainOther'),(67,'underusedOther'),(99,'visitorBarrierOther'),(137,'valueOther')]:replace(i,'____________',token(key))
  for i,key in [(87,'chapterVisitorMinimum'),(88,'metric.visitors')]:replace(i,'______',token(key))
  for i,key in enumerate(['invite','oneToOne','cooperate','learn','trust','events']):
   for j,choice in enumerate(['willing','uncertain','unwilling']):boxes(110+4*i+j,[f'commit.{key}.{choice}'])
  for start,count,key in [(47,4,'personalGrowth'),(52,4,'businessChallenge'),(59,4,'usageReason'),(70,5,'earlierActions'),(78,5,'partnerStory'),(92,4,'chapterGrowthReason'),(147,3,'nextYearPlan'),(151,3,'teamSupportPlan'),(157,4,'chapterSuggestions')]:
   for j in range(count):blank(start+j,f'{key}.{j}')
  replace(155,'______年____月____日',token('mspUp'));replace(155,'_______年____月____日',token('mspDown'))
  replace(161,'_'*23,token('memberSignature'));replace(163,'_'*68,token('interviewerSignatures'));replace(164,'___________年_______月_________日',token('signatureDate'))
 else:
  for i,key in enumerate(['systemUse','cultureFit','longTerm','cooperation','chapterGrowth']):
   for j,choice in enumerate(['high','medium','low']):boxes(6+4*i+j,[f'rating.{key}.{choice}'])
  for i,key in [(27,'recommendNormal'),(28,'recommendConditional'),(29,'recommendReject')]:boxes(i,[key])
  for i in range(8):boxes(37+i,[f'improvement{i+1}'])
  for i in range(7):boxes(46+i,[f'rejectReason{i+1}'])
  replace(54,'_'*18,token('coach'))
  for i in range(14):blank(56+i,f'improvementGoal.{i}')
  assert ps[71].getparent().tag==W+'tc', 'Notes must remain in the original cell'
  blank(71,'notes.0')
  replace(73,'_'*67,token('assessmentSignatures'));replace(75,'__________年___________月____________日',token('assessmentDate'))
 # Pagination compatibility: retain original geometry/fonts/text, let the original
 # assessment tables follow text flow, and keep each signature/date group together.
 # The converted source has a 505-twip body top margin while its page header
 # contains the full form title. Reserve header space on continuation pages.
 for margins in r.xpath('//w:sectPr/w:pgMar',namespaces=ns):margins.set(W+'top','1900' if kind=='assessment' else '1250')
 if kind=='assessment':
  for floating in r.xpath('//w:tblPr/w:tblpPr',namespaces=ns):floating.getparent().remove(floating)
 for index in ([161,162,163] if kind=='interview' else [73,74]):
  props=ps[index].find(W+'pPr')
  if props is None:props=E.Element(W+'pPr');ps[index].insert(0,props)
  if props.find(W+'keepNext') is None:E.SubElement(props,W+'keepNext')
 xml=E.tostring(r,xml_declaration=True,encoding='UTF-8',standalone=True)
 parts={item.filename:base64.b64encode(xml if item.filename=='word/document.xml' else z.read(item.filename)).decode() for item in z.infolist()}
 package={'schema':'fulian.interview-template.v1','templateId':template_id,'sourceFilename':source.name,'sourceSha256':source_sha,'headerVersion':'V1.1','headerDate':'20261012','parts':parts}
 out.mkdir(parents=True,exist_ok=True);target=out/(template_id+'.json');target.write_text(json.dumps(package,ensure_ascii=False,separators=(',',':')));target.chmod(0o600)
 print(json.dumps({'kind':kind,'path':str(target),'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'slots':len(set(re.findall(rb'\{\{([^{}]+)\}\}',xml)))},ensure_ascii=False))
