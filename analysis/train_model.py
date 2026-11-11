import csv;
import random;

from sklearn.ensemble import RandomForestClassifier


FEATURES = [
    "transfersLastMinute" , "sentLast24hMinor" , "averageAmountMinor" ,
    "pastTransferCount" , "isNewReceiver" , "isFraud" , "senderBalanceMinor" , "amountMinor"
]
HOLDS = 80
def to_number(value):
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
        "precision" : caught / held if held else 0,
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
cut = int(len(rows) * 0.8)
train = rows[:cut]
test = rows[cut:]

def inputs(part):
    return[[to_number(r[name]) for name in FEATURES] for r in part]

def anwsers(part):
    return[r["isFraud"] == "true" for r in part]

x_train , y_train = inputs(train) , anwsers(train)
x_test , y_test = inputs(test) , anwsers(test)

model = RandomForestClassifier(n_estimators = 100 , random_state = 42)
model.fit(x_train , y_train)

train_scores = [p[1] for p in model.predict_proba(x_train)]
test_scores = [p[1] for p in model.predict_proba(x_test)]

print("---the trap: grading on rows the model has seen---")
grade("model on TRAIN rows" , [s >= 0.5 for s in train_scores] , y_train)

print("---the real grade : rows it has never seen ---")
grade("never-flag guard on TEST rows" , [False] * len(y_test) , y_test)
grade("model on TEST rows, hold score >= 0.5" , [s >= 0.5 for s in test_scores] , y_test)

order = sorted(range(len(test_scores)) , key = lambda  i: test_scores[i] , reverse = True)
top = set(order[:HOLDS])
grade(f"model on TEST rows , hold the top  {HOLDS}" , [i in top for i in range (len(test_scores))], y_test)

