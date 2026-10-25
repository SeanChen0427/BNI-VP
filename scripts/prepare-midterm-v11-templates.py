"""Prepare the two reviewed V1.1 midterm originals outside the repository."""
import argparse, base64, hashlib, json, re
from pathlib import Path
from zipfile import ZipFile
from lxml import etree as E

p=argparse.ArgumentParser()
p.add_argument('--source-dir',required=True)
p.add_argument('--output-dir',required=True)
a=p.parse_args()
root=Path(__file__).resolve().parents[1];out=Path(a.output_dir).resolve()
if out==root or root in out.parents:raise SystemExit('Private templates must remain outside the repository')
ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'};W='{'+ns['w']+'}'
specs=[('interview','BNI 363 留員計畫-期中關懷訪談表V.1.1_20261012','c9500a294c1ac03236db51fae7c5a343672f79c6b667a055cdb516db57fe37cb','kp-midterm-interview-v1.1-20261012'),('assessment','BNI 363 留員計畫-期中關懷會員委員會內部評估表V.1.1_20261012','55afef011e70ec587cbaf966560bcb836bff7394e999861e3c45fbe17dfcfe54','kp-midterm-assessment-v1.1-20261012')]
for kind,stem,source_sha,template_id in specs:
 source=Path(a.source_dir)/(stem+'.docx');converted=source
 if hashlib.sha256(source.read_bytes()).hexdigest()!=source_sha:raise SystemExit('Unreviewed original: '+kind)
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
  for i,key in [(3,'chapter'),(4,'member'),(5,'profession'),(6,'meetingDate'),(7,'counselors')]:append(i,key)
  for i,keys in [(10,[f'gain{i}' for i in range(1,6)]),(11,['gain6','gain7']),(12,['gainOtherSelected']),(23,[f'barrier{i}' for i in range(1,6)]),(24,[f'barrier{i}' for i in range(6,11)]),(25,['barrierOtherSelected']),(31,[f'feeling{i}' for i in range(1,6)]),(32,['feeling6','feeling7']),(33,['feelingOtherSelected']),(48,[f'priority{i}' for i in range(1,6)]),(50,[f'support{i}' for i in range(1,6)]),(51,[f'support{i}' for i in range(6,9)]),(52,['supportOtherSelected']),(54,[f'action{i}' for i in range(1,5)]),(55,['action5','action6']),(56,['actionOtherSelected']),(58,[f'willingness{i}' for i in range(1,5)])]:boxes(i,keys)
  for i,key in [(12,'gainOther'),(25,'barrierOther'),(33,'feelingOther'),(52,'supportOther'),(56,'actionOther')]:replace(i,'＿'*8,token(key))
  replace(41,'＿'*4,token('engagement'))
  for start,count,key in [(14,3,'gainNotes'),(18,4,'achievement'),(27,3,'barrierNotes'),(34,2,'feelingNotes'),(37,3,'partners'),(43,4,'improvement'),(60,4,'renewalReason'),(65,4,'chapterSupport')]:
   for j in range(count):blank(start+j,f'{key}.{j}')
 else:
  for i,keys in [(4,[f'light{i}' for i in range(1,4)]),(6,[f'energy{i}' for i in range(1,6)]),(8,[f'arrangement{i}' for i in range(1,5)]),(9,['arrangement5','arrangement6']),(10,['arrangementOtherSelected']),(36,[f'focus{i}' for i in range(1,5)]),(37,[f'focus{i}' for i in range(5,8)]),(38,['focusOtherSelected'])]:boxes(i,keys)
  for i,key in [(10,'arrangementOther'),(38,'focusOther')]:replace(i,'＿'*8,token(key))
  for j,i in enumerate([13,14,*range(16,23),*range(24,31)]):boxes(i,[f'training{j+1}'])
  for i,key in [(34,'nextCareDate'),(39,'owner')]:replace(i,'＿'*12,token(key))
  for j in range(14):blank(41+j,f'summary.{j}')
  replace(55,'_'*65,token('assessmentSignatures'));replace(56,'____________年__________月__________日',token('assessmentDate'))
 # Reserve the original footer logo area when long answers extend naturally.
 for margins in r.xpath('//w:sectPr/w:pgMar',namespaces=ns):margins.set(W+'bottom',str(max(1000,int(margins.get(W+'bottom','0')))))
 # Keep each source question/heading with its first answer line across natural pages.
 for paragraph in ps:
  value=''.join(paragraph.xpath('.//w:t/text()',namespaces=ns))
  if re.match(r'^\d+\. |^◎',value):
   props=paragraph.find(W+'pPr')
   if props is None:props=E.Element(W+'pPr');paragraph.insert(0,props)
   if props.find(W+'keepNext') is None:E.SubElement(props,W+'keepNext')
 xml=E.tostring(r,xml_declaration=True,encoding='UTF-8',standalone=True)
 parts={item.filename:base64.b64encode(xml if item.filename=='word/document.xml' else z.read(item.filename)).decode() for item in z.infolist()}
 package={'schema':'fulian.interview-template.v1','templateId':template_id,'sourceFilename':source.name,'sourceSha256':source_sha,'headerVersion':'V1.1','headerDate':'20261012','parts':parts}
 out.mkdir(parents=True,exist_ok=True);target=out/(template_id+'.json');target.write_text(json.dumps(package,ensure_ascii=False,separators=(',',':')));target.chmod(0o600)
 print(json.dumps({'kind':kind,'path':str(target),'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'slots':len(set(re.findall(rb'\{\{([^{}]+)\}\}',xml)))},ensure_ascii=False))
