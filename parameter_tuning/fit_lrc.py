import pandas as pd
import matplotlib.pyplot as plt
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score
from statsmodels.stats.outliers_influence import variance_inflation_factor
import json

data = pd.read_csv("features.csv")
X = data.drop("won", axis=1)
y = data["won"]

# check collinearity using variance inflation factor
vif_data = pd.DataFrame()
vif_data["feature"] = X.columns
vif_data["VIF"] = [variance_inflation_factor(X.values, i) for i in range(len(X.columns))]
print("VIF")
print(vif_data)

# fit model
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=7)
lrc = LogisticRegression()
lrc.fit(X_train, y_train)

# assess accuracy
pred_train = lrc.predict(X_train)
pred_test = lrc.predict(X_test)
print("Train accuracy:", accuracy_score(y_train, pred_train))
print("Test accuracy:", accuracy_score(y_test, pred_test))

# Get the coefficients and intercept
coef_dict = dict(zip(X.columns, lrc.coef_[0]))
intercept = lrc.intercept_[0]
print("const featureWeights: Record<string, number> = " + json.dumps(coef_dict, indent=2))
print("const currentPlayerBias = " + str(intercept))
plt.barh(X.columns, lrc.coef_[0])
plt.show()