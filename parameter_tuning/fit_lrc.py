import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score
from statsmodels.stats.outliers_influence import variance_inflation_factor
import json


def split_data(X, y, train_fraction):
    assert len(X) == len(y)
    assert train_fraction > 0 and train_fraction <= 1
    split_idx = int(len(X) * train_fraction)
    # split (note that pandas slice indices are both inclusive)
    return X.loc[:split_idx-1], X.loc[split_idx:], y.loc[:split_idx-1], y.loc[split_idx:]


# def split_data(data, train_size, opening_idx):
#     # train test split (note that pandas slice indices are both inclusive)
#     split_idx = int(len(data) * train_size)
#     train = data.loc[:split_idx-1]
#     test = data.loc[split_idx:]

#     # opening / not opening split for training

#     # X y split


def check_collinearity(data):
    X = data.drop(["won", "move-index"], axis=1)
    # check collinearity using variance inflation factor
    vif_data = pd.DataFrame()
    vif_data["feature"] = X.columns
    vif_data["VIF"] = [variance_inflation_factor(X.values, i) for i in range(len(X.columns))]
    print(vif_data)
    print("")


def fit(data, opening_idx, show_coef=True):
    print("Testing opening idx", opening_idx, "------------------------")
 
    X = data.drop(["won"], axis=1)
    y = data["won"]

    # fit model
    X_train, X_test, y_train, y_test = split_data(X, y, train_fraction=0.9)
    opening_pos_train = X_train["move-index"] < opening_idx
    opening_pos_test = X_test["move-index"] < opening_idx
    later_pos_train = np.logical_not(opening_pos_train)
    later_pos_test = np.logical_not(opening_pos_test)
    X_train = X_train.drop("move-index", axis=1)
    X_test = X_test.drop("move-index", axis=1)

    if np.sum(opening_pos_train) < 20 or np.sum(opening_pos_test) < 20 or np.sum(later_pos_train) < 20 or np.sum(later_pos_test) < 20:
        return "skip"

    opening_model = LogisticRegression()
    later_model = LogisticRegression()
    opening_model.fit(X_train[opening_pos_train], y_train[opening_pos_train])
    later_model.fit(X_train[later_pos_train], y_train[later_pos_train])

    # assess accuracy
    accuracy_opening_train = accuracy_score(y_train[opening_pos_train], opening_model.predict(X_train[opening_pos_train]))
    accuracy_opening_test = accuracy_score(y_test[opening_pos_test], opening_model.predict(X_test[opening_pos_test]))
    accuracy_later_train = accuracy_score(y_train[later_pos_train], later_model.predict(X_train[later_pos_train]))
    accuracy_later_test = accuracy_score(y_test[later_pos_test], later_model.predict(X_test[later_pos_test]))
    # get weighted average for overall accuracy
    opening_frac_train = np.sum(opening_pos_train) / opening_pos_train.size
    opening_frac_test = np.sum(opening_pos_test) / opening_pos_test.size
    accuracy_train = accuracy_opening_train * opening_frac_train + accuracy_later_train * (1-opening_frac_train)
    accuracy_test = accuracy_opening_test * opening_frac_test + accuracy_later_test * (1-opening_frac_test)
    print("Opening fraction train:", opening_frac_train)
    print("Opening train accuracy:", accuracy_opening_train)
    print("Opening test accuracy:", accuracy_opening_test)
    print("Later train accuracy:", accuracy_later_train)
    print("Later test accuracy:", accuracy_later_test)
    print("Train accuracy:", accuracy_train)
    print("Test accuracy:", accuracy_test)

    if show_coef:
        # print model parameters
        print("")
        print(f"const openingIdx = {opening_idx}")
        print("const blendRange = 6\n")
        opening_coef_dict = dict(zip(X_train.columns, opening_model.coef_[0]))
        print("const openingFeatureWeights: Record<string, number> = " + json.dumps(opening_coef_dict, indent=2))
        print("const openingCurrentPlayerBias = " + str(opening_model.intercept_[0]))
        print("")
        later_coef_dict = dict(zip(X_train.columns, later_model.coef_[0]))
        print("const laterFeatureWeights: Record<string, number> = " + json.dumps(later_coef_dict, indent=2))
        print("const laterCurrentPlayerBias = " + str(later_model.intercept_[0]))

        # plot model parameters

        fig, (ax1, ax2) = plt.subplots(1, 2, sharey=True)
        fig.suptitle(f"Opening Index: {opening_idx}\nTrain accuracy: {accuracy_train:.4f}\nTest accuracy: {accuracy_test:.4f}")

        ax1.barh(X_train.columns, opening_model.coef_[0])
        ax1.barh(["bias"], opening_model.intercept_[0])
        ax1.set_title(f"Opening\nTrain accuracy: {accuracy_opening_train:.4f}\nTest accuracy: {accuracy_opening_test:.4f}")

        ax2.barh(X_train.columns, later_model.coef_[0])
        ax2.barh(["bias"], later_model.intercept_[0])
        ax2.set_title(f"Later\nTrain accuracy: {accuracy_later_train:.4f}\nTest accuracy: {accuracy_later_test:.4f}")

        xlim1 = ax1.get_xlim()
        xlim2 = ax2.get_xlim()
        max_xlim = (min(xlim1[0], xlim2[0]), max(xlim1[1], xlim2[1]))
        ax1.set_xlim(max_xlim)
        ax2.set_xlim(max_xlim)

        fig.tight_layout()
        plt.show()

    return accuracy_test



def main():
    data = pd.read_csv("features.csv")
    check_collinearity(data)

    # fit(data, 13)
    # return

    indices = []
    results = []
    for opening_idx in range(0, 40):
        result = fit(data, opening_idx, False)
        if result != "skip":
            indices.append(opening_idx)
            results.append(result)
    
    plt.plot(indices, results)
    plt.show()

    best = results.index(max(results))
    fit(data, indices[best], True)



if __name__ == "__main__":
    main()