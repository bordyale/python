from datetime import datetime, timedelta
from decimal import Decimal

import mysql.connector
import pandas as pd
from lib.functions import Sql_query, sendemailHtml
from lib.loadprops import *
import os


def buildmess(mycursor, sql) :
    yesterday = datetime.today() - timedelta(days=180)
    sql = sql.bfin_prod
    mycursor.execute(sql)
    prods = mycursor.fetchall()
    prods_dict = {}
    if len(prods) > 0:
        for prod in prods:
            prod_id = prod[0]
            last_price_check = prod[1]
            if last_price_check:
                prods_dict[prod_id] = last_price_check
            else:
                prods_dict[prod_id] = yesterday
        # prods_dict_sorted = dict(sorted(prods_dict.items(), key = lambda key: prods_dict[key], reverse = True)) 
        prods_list_sorted = sorted(prods_dict.items(), key=lambda x: x[1])
        print(type(prods_list_sorted))
        prods_dict_sorted = dict(prods_list_sorted)
        for key, value in prods_dict_sorted.items():
            print(key, ":", value)

def main():
    configs = loadprops()
    mydb = mysql.connector.connect(
        host="localhost",
        user=configs.get("DB_User").data,
        password=configs.get("DB_PWD").data,
        database=configs.get("DB_Name").data,
    )
    mycursor = mydb.cursor()
    dirname, filename = os.path.split(os.path.abspath(__file__))
    sql = Sql_query(dirname + "/sql")

    buildmess(mycursor, sql)
 
if __name__ == "__main__":
    main()
