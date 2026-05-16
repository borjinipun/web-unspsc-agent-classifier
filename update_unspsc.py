import json

examples = {
    "12000000": " (e.g. lab chemicals, industrial gases, compounds)",
    "15000000": " (e.g. oil, gasoline, coal, grease)",
    "23000000": " (e.g. casting, molding, milling machinery)",
    "27000000": " (e.g. hand tools, power tools, hydraulic tools)",
    "30000000": " (e.g. doors, windows, structural steel, roofing)",
    "31000000": " (e.g. adhesives, sealants, bearings, fasteners, hardware)",
    "32000000": " (e.g. integrated circuits, printed circuits, passive components)",
    "39000000": " (e.g. switches, relays, lamps, electrical wire, breakers)",
    "40000000": " (e.g. HVAC, pipes, plumbing, pumps, compressors)",
    "41000000": " (e.g. scales, microscopes, oscilloscopes)",
    "42000000": " (e.g. syringes, surgical instruments, x-ray)",
    "43000000": " (e.g. computers, software, networking, phones)",
    "46000000": " (e.g. alarms, surveillance, PPE, fire fighting)",
    "52000000": " (e.g. TVs, refrigerators, consumer electronics)"
}

with open('data/unspsc.json', 'r') as f:
    data = json.load(f)

for code, example in examples.items():
    if code in data:
        if "(e.g." not in data[code]["title"]:
            data[code]["title"] += example

with open('data/unspsc.json', 'w') as f:
    json.dump(data, f)
