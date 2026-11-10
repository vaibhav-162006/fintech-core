import csv;
import random;

EXPECTED = [
    "transferLastMinute","sendLast24hMinor","pastTransferCount","averageAmountMinor",
    "isNewReciever","senderBalanceMinor","amountMinor","isFraud"
]
def measure(caught , false_alarms , missed , passed):
    total = caught + false_alarms + missed + passed
    held = caught + false_alarms
    frauds = caught + missed
    return {
        "accuracy" : (caught + passed) / total if total else 0,
        "precision" : caught / held if held else 0,
        "recall" : caught / frauds if frauds else 0,
    }

with open("data/payments.csv") as f: 
    rows = list(csv.DictReader(f))

header = list(rows[0].keys())
missing = [name for name in EXPECTED if name not in header]
if missing:
    raise SystemExit("missing colounms: " + str(missing))

    blanks = sum(1 for r in rows for v in r.values() if v == " ")
    label_values = sorted(set(r["isFraud"] for r in rows))
    print("blank cells: " , blanks)
    print("values in isFraud" , label_values)

total = len(rows)
fraud = sum(1 for r in rows if r["isFraud"] == "true")
print(f"rows : {total}, fraud: {fraud} ({fraud/total:.1%})")

never_flag = measure(caught=0, false_alarms=0, missed=fraud,passed=total-fraud)
print(f"never-flag guard: {never-flag}")


random.Random(42).shuffle(rows)
cut = int(total * 0.8)
train = rows[:cut]
test = rows[cut:]

for name, part in [("train" , train) , ("test" , test)]:
    part_fraud = sum(1 for r in part if r["isFraud"] == "true")
    print(f"{name}: {len(part)} rows , {part_fraud} fraud ({part_fraud / len(part):.1%})")
    