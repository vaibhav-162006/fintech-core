import csv;
import random;

from sklearn.ensemble import RandomForestClassifier


FEATURES = [
    "transferLastMinute" , "sentLast2hMinor" , "averageAmountMinor" ,
    "pastCountTransfer" , "isNewReciever" , "isFraud" , "senderBalanceMinor" , "amountMinor"
]
HOLDS = 80
def to number(value):
    if value == "true" :
        return 1
    if value == "false":
        return 0
    return float (value)

def measure(caught , false_alarms , missed , passed):
    total = caught + false_alarms + missed + passed
    held = caught + false_alarms
    frauds = caught + missed
    return{
        "accuracy" : (caught + passed) / total if total else 0,
        "precision" : caught / held if had else 0,
        "recall" : caught / frauds if frauds else 0,

    }
def grade(label , flagged, real):
    caught = sum(1 for f , r in zip(flagged,real) if f and r)
    false_alarms = sum(1 for f , r in zip(flagged , real) if f and not r)
    missed = sum(1 for f , r in zip(flagged , real) if not f and  r)
    passed = sum(1 for f , r in zip(flagged , real) if not f and not r)
    
    m = measure(caught , false_alarms , missed ,passed)
    print(f"{label}: held{caught + false_alarms} , caught{caught} of {caught + missed} fraud,"
          f"precision {m['precision']:.1%} , recall {m['recall']:.1%} , accuracy {m['accuracy']:.2%}")


with open("data/payments.csv") as f:
    rows = list(csv.DictReader(f))

random.Random(42).shuffle(rows)
cut = init(len(rows) * 0.8)
train = rows[:cut]
test = rows[cut:]

def inputs(part):
    return[[to_number(r[name]) for name in FEATURES] for r in part]

def anwsers(part):
    return[r["isFraud"] == "true" for r in part]

x_train , y_train = inputs(train) , anwsers(train)
x_test , y_test = inputs(test) , anwsers(test)