import pandas as pd
import matplotlib.pyplot as plt
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score
from statsmodels.stats.outliers_influence import variance_inflation_factor
import json


def split_data(X, y, train_size):
    assert len(X) == len(y)
    assert train_size >=0 and train_size <= 1
    split_idx = int(len(X) * train_size)
    # split (note that pandas slice indices are both inclusive)
    return X.loc[:split_idx-1], X.loc[split_idx:], y.loc[:split_idx-1], y.loc[split_idx:]


def fit(csv_file):
    data = pd.read_csv(csv_file)

    X = data.drop("won", axis=1)
    y = data["won"]

    # check collinearity using variance inflation factor
    vif_data = pd.DataFrame()
    vif_data["feature"] = X.columns
    vif_data["VIF"] = [variance_inflation_factor(X.values, i) for i in range(len(X.columns))]
    print("VIF")
    print(vif_data)

    # fit model
    X_train, X_test, y_train, y_test = split_data(X, y, train_size=0.9)
    lrc = LogisticRegression()
    lrc.fit(X_train, y_train)

    # assess accuracy
    accuracy_train = accuracy_score(y_train, lrc.predict(X_train))
    accuracy_test = accuracy_score(y_test, lrc.predict(X_test))
    print("Train accuracy:", accuracy_train)
    print("Test accuracy:", accuracy_test)

    # Get the coefficients and intercept
    coef_dict = dict(zip(X.columns, lrc.coef_[0]))
    intercept = lrc.intercept_[0]
    print("const featureWeights: Record<string, number> = " + json.dumps(coef_dict, indent=2))
    print("const currentPlayerBias = " + str(intercept))
    plt.barh(X.columns, lrc.coef_[0])
    plt.barh(["bias"], intercept)
    plt.title(f"Train accuracy: {accuracy_train}\nTest accuracy: {accuracy_test}")
    plt.tight_layout()
    plt.show()


if __name__ == "__main__":
    fit("features.csv")
    # fit("selectedFeatures.csv")