"""Prepare Sean's verified V1.1 blank form; private packages never enter Git."""
import argparse
import base64
import hashlib
import json
import re
from pathlib import Path
from zipfile import ZipFile
from lxml import etree as E

p = argparse.ArgumentParser()
p.add_argument('--source-doc', required=True)
p.add_argument('--converted-docx', required=True)
p.add_argument('--output-dir', required=True)
a = p.parse_args()
root = Path(__file__).resolve().parents[1]
out = Path(a.output_dir).resolve()
if out == root or root in out.parents:
    raise SystemExit('Original forms and template packages must remain outside the repository')
source, converted = Path(a.source_doc), Path(a.converted_docx)
expected = 'f85c689b2b61508d5d0ebf94a7f54b0fb5a005e7c20716b6b0f2a6386f1a68c9'
if hashlib.sha256(source.read_bytes()).hexdigest() != expected:
    raise SystemExit('Unreviewed original template')
if hashlib.sha256(converted.read_bytes()).hexdigest() != '7a0813fd3a9eae1ed574b65e0892250990c2b7b1a5fe1420618ee5fcff7793a9':
    raise SystemExit('Use the reviewed blank DOCX conversion')
z = ZipFile(converted)
ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
W = '{' + ns['w'] + '}'
r = E.fromstring(z.read('word/document.xml'))
ps = r.xpath('//w:p', namespaces=ns)

def token(key):
    return '{{' + key + '}}'

def replace(i, old, new):
    """Replace a literal even when Word split it over runs; keep run properties."""
    ts = ps[i].xpath('.//w:t', namespaces=ns)
    text = ''.join(t.text or '' for t in ts)
    start = text.index(old)
    end, offset, inserted = start + len(old), 0, False
    for t in ts:
        value = t.text or ''
        left, right = max(start - offset, 0), min(end - offset, len(value))
        if left < right:
            t.text = value[:left] + (new if not inserted else '') + value[right:]
            t.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
            inserted = True
        offset += len(value)

def put(i, key):
    # The reviewed source reserves this paragraph for an answer.
    assert not ''.join(ps[i].xpath('.//w:t/text()', namespaces=ns)).strip(), i
    run = ps[i].find(W + 'r')
    if run is None:
        run = E.SubElement(ps[i], W + 'r')
    t = E.SubElement(run, W + 't')
    t.text = token(key)
    t.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')

for i, old, key in [(14, '_'*20, 'applicant'), (14, '_'*20, 'chapter'),
                    (15, '_'*22, 'profession'), (15, '_'*20, 'companyName'),
                    (16, '_'*19, 'meetingDate'), (16, '_'*20, 'interviewers'),
                    (33, '_'*10, 'experienceYears'), (33, '_'*10, 'teamSize')]:
    replace(i, old, token(key))
for start, count, key in [(19,6,'businessContent'), (26,6,'advantages'),
                          (35,7,'successStories'), (52,3,'annualBreakthrough'),
                          (58,3,'growthVision'), (62,5,'threeYearVision'),
                          (69,5,'targetMarkets'), (75,5,'cooperationIndustries')]:
    for k in range(count):
        put(start+k, f'{key}.{k}')
for i, keys in [(33,['employmentFull','employmentPart']),
                (44,[f'joinOption{k}' for k in range(1,5)]),
                (45,[f'joinOption{k}' for k in range(5,9)]),
                (46,['joinOtherSelected']),
                (49,[f'goalOption{k}' for k in range(1,7)]),
                (50,['goalOtherSelected']), (56,['growthPlanYes','growthPlanNo']),
                (81,[f'cooperationOption{k}' for k in range(1,7)]),
                (82,['cooperationOtherSelected']),
                (90,['participationYes','participationNo']),
                (94,['learningYes','learningNo']), (98,['givingYes','givingNo']),
                (102,['visitorCultureYes','visitorCultureNo']),
                (106,['trustUnderstood']), (111,['successUnderstood']),
                (114,['engagementUnderstood']), (221,['rightsCategory']),
                (224,['rightsEmploymentFull','rightsEmploymentPart']),
                (225,['rightsQualification']), (234,['rightsOrganizationYes']),
                (235,['rightsOrganizationNo']), (241,['rightsPolicyFour']),
                (246,['rightsMsp']), (250,['rightsSession']),
                (254,['rightsAttendance']), (257,['rightsProxy']),
                (260,['rightsGreen']), (264,['rightsFees']), (267,['rightsEthics']),
                (269,['pledgeGuestsYes']), (271,['pledgeGuestsNo'])]:
    for key in keys:
        replace(i, '□', token(key))
for i,key in [(46,'joinReasonOther'),(50,'annualGoalOther'),(82,'cooperationOther')]:
    replace(i, '_'*13, token(key))
replace(224,'_'*10,token('rightsExperienceYears'))
replace(227,'_'*28,token('rightsOrganizationName'))
for i,keys in [(244,['mspUpDate','mspDownDate']), (245,['mspUpDate2','mspDownDate2'])]:
    for key in keys:
        replace(i,'______年_____月_____日',token(key))
replace(249,'______年______月______日',token('sessionDate1'))
for i,keys in [(269,['guest1Name','guest1Relation']), (270,['guest2Name','guest2Relation'])]:
    replace(i,'_'*15,token(keys[0]))
    replace(i,'_'*11,token(keys[1]))
for i,width,key in [(117,20,'applicantSignature'), (119,63,'interviewerSignatures'),
                     (274,20,'rightsApplicantSignature'), (276,67,'rightsInterviewerSignatures')]:
    replace(i,'_'*width,token(key))
for i,key in [(121,'interviewSignatureDate'),(277,'rightsSignatureDate')]:
    replace(i,'______年______月______日',token(key))
for k in range(20):
    for j,key in enumerate(['contactName','contactIndustry','contactRelation']):
        put(133+4*k+j,f'{key}{k+1}')

xml = E.tostring(r,xml_declaration=True,encoding='UTF-8',standalone=True)
parts = {item.filename:base64.b64encode(xml if item.filename=='word/document.xml' else z.read(item.filename)).decode() for item in z.infolist()}
package = {'schema':'fulian.interview-template.v1','templateId':'kp-membership-v1.1-20261012',
           'sourceFilename':source.name,'sourceSha256':expected,'headerVersion':'V1.1','headerDate':'20261012','parts':parts}
out.mkdir(parents=True,exist_ok=True)
target=out/(package['templateId']+'.json')
target.write_text(json.dumps(package,ensure_ascii=False,separators=(',',':')))
target.chmod(0o600)
print(json.dumps({'path':str(target),'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),
                  'slots':len(set(re.findall(rb'\{\{([^{}]+)\}\}',xml)))},ensure_ascii=False))
