import csv
import random

from sklearn.ensemble import RandomForestClassifier

SEED = 42

FEATURES = [
    "transfersLastMinute" , "sentLast24hMinor" , "averageAmountMinor" , "amountMinor",
    "isNewReceiver" , "pastTransferCount" , "senderBalanceMinor" 
]

def to_number(value):
    if value == "true":
        return 1
    if value == "false":
        return 0 
    return float(value)

def rule_score(f):
    points = 0
    amount = f["amountMinor"]
    if f["transfersLastMinute"] >= 5:
        points += 40
    if f["pastTransferCount"] >= 3 and f["averageAmountMinor"] > 0 and amount > f["averageAmountMinor"] * 5:
        points += 30
    if f["isNewReceiver"] and amount >= 100000:
        points += 25
    if f["senderBalanceMinor"] > 0 and amount * 100 >= f["senderBalanceMinor"] * 90:
        points += 20
    if f["sentLast24hMinor"] + amount >= 1000000:
        points += 70
    return min(points , 100)

def quiet(**changes):
    base = {
        "transfersLastMinute":0 , "pastTransferCount":0 , "averageAmountMinor":0,
        "isNewReceiver":0,  "sentLast24hMinor":0, "senderBalanceMinor":1000000,
        "amountMinor":1000,
    }
    base.update(changes)
    return base

assert rule_score(quiet()) == 0
assert rule_score(quiet(transfersLastMinute=5)) == 40
assert rule_score(quiet(pastTransferCount=5,averageAmountMinor=10000,amountMinor=60000)) == 30
assert rule_score(quiet(pastTransferCount=5,averageAmountMinor=10000,amountMinor=50000)) == 0
assert rule_score(quiet(isNewReceiver=1,senderBalanceMinor=100000,amountMinor=100000)) == 45
assert rule_score(quiet(sentLast24hMinor=950000,amountMinor=60000)) == 70
assert rule_score(quiet(transfersLastMinute=5,pastTransferCount=5,averageAmountMinor=10000,amountMinor=60000)) == 70
print("rule copy matches the TypeScript test cases")

def measure(caught,false_alarms,missed,passed):
    total = caught + false_alarms + missed + passed
    held = caught + false_alarms
    frauds = caught + missed
    return{
        "precision" : caught/held if held else 0,
        "recall" : caught / frauds if frauds else 0,
    }

def grade(label , flagged , real):
    caught = sum(1 for f , r in zip(flagged , real) if f and r)
    false_alarms = sum(1 for f, r in zip(flagged , real) if f and not r)
    missed = sum(1 for f , r in zip(flagged , real) if not f and r)
    passed = sum(1 for f,r in zip(flagged , real) if not f and not r)
    m = measure(caught , false_alarms , missed ,passed)

    print(f"{label}: held {caught + false_alarms} , caught {caught} of {caught + missed} fraud , "
            f"precision {m['precision']:.1%} , recall {m['recall']:.1%}")

def top_n(scores , n):
    rng = random.Random(1)
    order = sorted(range(len(scores)) , key = lambda i: (scores[i] , rng.random()), reverse = True)
    chosen = set(order[:n])
    return[i in chosen for i in range(len(scores))]


with open("data/payments.csv") as f:
    rows = list(csv.DictReader(f))

random.Random(SEED).shuffle(rows)
cut = int(len(rows) * 0.8)
train = rows[:cut]
test = rows[cut:]


def numbers(row):
    return{
        name: to_number(row[name]) for name in FEATURES
    }

def as_inputs(part):
    return[[to_number(r[name]) for name in FEATURES] for r in part]


y_train = [r["isFraud"] == "true" for r in train]
y_test = [r["isFraud"] == "true" for r in test]

rule_flags = [rule_score(numbers(r)) >= 40 for r in test]
rule_holds = sum(rule_flags)

model = RandomForestClassifier(n_estimators=100 , random_state=SEED)
model.fit(as_inputs(train) , y_train)
model_scores = [p[1] for p in model.predict_proba(as_inputs(test))]

print(f"seed {SEED}: {len(test)} test rows, {sum(y_test)} fraud")
grade("rule guard (hold what it flags)" , rule_flags , y_test)
grade(f"model , the same {rule_holds} holds" , top_n(model_scores , rule_holds), y_test)
grade("model, 80 holds" , top_n(model_scores,80) , y_test)





