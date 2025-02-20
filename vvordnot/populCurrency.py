# Python program to convert the currency
# of one country to that of another country

# Import the modules needed
import requests
import mysql.connector
from lib.functions import Sql_query, sendemailHtml, get_next_seq_id
from lib.loadprops import *
from datetime import datetime
import os

class Currency_convertor:
    # empty dict to store the conversion rates
    rates = {}
    def __init__(self, url):
        data = requests.get(url).json()
        # print(f'{data=}')
        # Extracting only the rates from the json data
        self.rates = data["rates"]

    # function to do a simple cross multiplication between
    # the amount and the conversion rates
    def convert(self, mydb, sql, cur_pairs):
        mycursor = mydb.cursor(buffered = True)
        cur_pairs_list = cur_pairs.split(',')
        for pair in cur_pairs_list:
            uom_id = pair.split(':')[0]
            uom_id_to = pair.split(':')[1]
            print(f'{uom_id=}   {uom_id_to=}')
            amount = 1
            if uom_id != 'EUR' :
                amount = 1 / self.rates[uom_id]
            # limiting the precision to 2 decimal places
            amount = round(amount * self.rates[uom_id_to], 2)
            print(f'{amount=} {type(amount)}')
            query = sql.uom_conversion_update
            args = (amount, datetime.today(), uom_id, uom_id_to)
            mycursor.execute(query, args)
            mydb.commit()


def main():
    configs = loadprops()
    mydb = mysql.connector.connect(
        host="localhost",
        user=configs.get("DB_User").data,
        password=configs.get("DB_PWD").data,
        database=configs.get("DB_Name").data,
    )
    dirname, filename = os.path.split(os.path.abspath(__file__))
    sql = Sql_query(dirname + "/sql")

    YOUR_ACCESS_KEY = configs.get("data_fixer_key").data
    url = str.__add__('http://data.fixer.io/api/latest?access_key=', YOUR_ACCESS_KEY)
    c = Currency_convertor(url)

    cur_pairs = configs.get("currency_pairs").data

    c.convert(mydb, sql, cur_pairs)

 
if __name__ == "__main__":
    main()
