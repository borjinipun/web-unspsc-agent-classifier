import csv
import json

data = {}

with open('data/unspsc.csv', 'r', encoding='utf-8', errors='ignore') as f:
    reader = csv.DictReader(f)
    for row in reader:
        seg = row.get('Segment', '').strip()
        seg_t = row.get('Segment Title', '').strip()
        seg_d = row.get('Segment Definition', '').strip()
        
        fam = row.get('Family', '').strip()
        fam_t = row.get('Family Title', '').strip()
        fam_d = row.get('Family Definition', '').strip()
        
        cls = row.get('Class', '').strip()
        cls_t = row.get('Class Title', '').strip()
        cls_d = row.get('Class Definition', '').strip()
        
        com = row.get('Commodity', '').strip()
        com_t = row.get('Commodity Title', '').strip()
        com_d = row.get('Commodity Definition', '').strip()
        
        if not seg:
            continue
            
        if seg not in data:
            data[seg] = {"title": seg_t, "definition": seg_d, "families": {}}
            
        if fam:
            if fam not in data[seg]["families"]:
                data[seg]["families"][fam] = {"title": fam_t, "definition": fam_d, "classes": {}}
                
            if cls:
                if cls not in data[seg]["families"][fam]["classes"]:
                    data[seg]["families"][fam]["classes"][cls] = {"title": cls_t, "definition": cls_d, "commodities": {}}
                    
                if com:
                    data[seg]["families"][fam]["classes"][cls]["commodities"][com] = {
                        "title": com_t, "definition": com_d
                    }

with open('data/unspsc.json', 'w', encoding='utf-8') as f:
    json.dump(data, f)

print("Done converting CSV to JSON.")
