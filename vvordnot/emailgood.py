
import smtplib
from email.message import EmailMessage
 
EMAIL_ADDRESS = 'system.bordignon@gmail.com'
EMAIL_ADDRESS_TO = 'alessio.bordignon@gmail.com'
EMAIL_PASSWORD = 'dwqq fpef txem bgun'
 
msg = EmailMessage()
msg['Subject'] = 'Beautiful Subject'
msg['From'] = EMAIL_ADDRESS
msg['To'] = EMAIL_ADDRESS_TO
msg.set_content('''
    <!DOCTYPE html>
    <html>
    <head>
        <link rel="stylesheet" type="text/css" hs-webfonts="true" href="https://fonts.googleapis.com/css?family=Lato|Lato:i,b,bi">
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style type="text/css">
          h1{font-size:56px}
          h2{font-size:28px;font-weight:900}
          p{font-weight:100}
          td{vertical-align:top}
          #email{margin:auto;width:600px;background-color:#fff}
        </style>
    </head>
    <body bgcolor="#F5F8FA" style="width: 100%; font-family:Lato, sans-serif; font-size:18px;">
    <div id="email">
        <table role="presentation" width="100%">
            <tr>
                <td bgcolor="#00A4BD" align="center" style="color: white;">
                    <h1> Welcome!</h1>
                </td>
        </table>
        <table role="presentation" border="0" cellpadding="0" cellspacing="10px" style="padding: 30px 30px 30px 60px;">
            <tr>
                <td>
                    <h2>Custom stylized email</h2>
                    <p>
                        You can add HTML/CSS code here to stylize your emails.
                    </p>
                </td>
            </tr>
        </table>
    </div>
    </body>
    </html>
''', subtype='html')
 
with smtplib.SMTP_SSL('smtp.gmail.com', 465) as smtp:
    smtp.login(EMAIL_ADDRESS, EMAIL_PASSWORD)
    smtp.send_message(msg)
