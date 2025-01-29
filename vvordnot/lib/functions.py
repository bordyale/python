#!/usr/bin/env python
# modified from http://elinux.org/RPi_Email_IP_On_Boot_Debian
import datetime
import smtplib
from email.message import EmailMessage
from email.mime.text import MIMEText

from lib.loadprops import *

# import urllib2


def sendemail(msgstr, passed_subject):
    # Change to your own account information
    # to = "alessio.bordignon@gmail.com"

    configs = loadprops()

    recipients = configs.get("recipients").data.split(",")
    gmail_user = configs.get("gmail_user").data
    gmail_password = configs.get("gmail_password").data
    print(recipients)
    smtpserver = smtplib.SMTP("smtp.gmail.com", 587)
    smtpserver.ehlo()
    smtpserver.starttls()
    smtpserver.ehlo
    smtpserver.login(gmail_user, gmail_password)
    today = datetime.date.today()
    # Very Linux Specific
    # arg='ip route list'
    # p=subprocess.Popen(arg,shell=True,stdout=subprocess.PIPE)
    # data = p.communicate()
    # split_data = data[0].split()
    # ipaddr = split_data[split_data.index('src')+1]
    # extipaddr = urllib2.urlopen("http://icanhazip.com").read().decode('utf-8')

    msg = MIMEText(msgstr)
    subject = configs.get(passed_subject).data
    msg["Subject"] = f"{subject} %s" % today.strftime("%b %d %Y")
    msg["From"] = gmail_user
    msg["To"] = ", ".join(recipients)
    smtpserver.sendmail(gmail_user, recipients, msg.as_string())
    smtpserver.quit()
    return "ok"


def sendemailHtml(htmltable, passed_subject):
    configs = loadprops()

    EMAIL_ADDRESS_TO = configs.get("recipients").data.split(",")
    EMAIL_ADDRESS = configs.get("gmail_user").data
    EMAIL_PASSWORD = configs.get("gmail_password").data

    msg = EmailMessage()
    today = datetime.date.today()
    subject = configs.get(passed_subject).data
    msg["Subject"] = f"{subject} %s" % today.strftime("%b %d %Y")
    msg["From"] = EMAIL_ADDRESS
    msg["To"] = EMAIL_ADDRESS_TO
    htmlcontent = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <link rel="stylesheet" type="text/css" hs-webfonts="true" href="https://fonts.googleapis.com/css?family=Lato|Lato:i,b,bi">
            <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style type="text/css">
              h1{{font-size:56px}}
              h2{{font-size:28px;font-weight:900}}
              p{{font-weight:100}}
              td{{vertical-align:top}}
              #email{{margin:auto;width:600px;background-color:#fff}}
            </style>
        </head>
        <body bgcolor="#F5F8FA" style="width: 100%; font-family:Lato, sans-serif; font-size:18px;">
        <div id="email">
            {htmltable}
        </div>
        </body>
        </html>
    """
    msg.set_content(htmlcontent, subtype="html")

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as smtp:
        smtp.login(EMAIL_ADDRESS, EMAIL_PASSWORD)
        smtp.send_message(msg)


class Sql_query(object):
    def __init__(self, sqldir):
        self.sqldir = sqldir

    def __getattr__(self, item):
        sqlFile = f"{self.sqldir}/{item}.sql".strip()
        # print(f"sqlFile: {sqlFile}")
        with open(sqlFile, "r") as file:
            data = file.read()
            return data
