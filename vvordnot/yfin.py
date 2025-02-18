import yfinance as yf
ticker = yf.Ticker("ZPRG.DE")
historical_data = ticker.history(period="5d")
print(type(historical_data))
# info = ticker.info
# lastDivValue = info['lastDividendValue']
# lastDivDate= info['lastDividendDate']
# divids = ticker.get_dividends()
# Display a summary of the fetched data
# print(historical_data[['Open', 'High', 'Low', 'Close', 'Volume']])


#for index,row in historical_data.iterrows():
#    print(type(row))
#    print(f'{index=} {row=}')

# print(f'{lastDivDate=} {lastDivValue=}')
# print(f'{info=}')
# print(f'{divids=}')

# index = len(historical_data)-2
serie = historical_data.iloc[-2]
# print(serie.name, type(serie.name))
close = serie[['Close']]
print(f'close: {close} {type(close)}')
print(f'close: {close.iloc[0]} {type(close.iloc[0])}')
