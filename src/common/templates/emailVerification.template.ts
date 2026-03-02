const emailVerificationTemplate = (data:{name:string, verificationCode:number, verificationCodeExpire:number}) => `
  <html>
    <head>
      <style>
        body {
          font-family: 'Verdana', 'Arial', sans-serif;
          font-family: Arial, sans-serif;
          background-color: #f2f3f8;
          margin: 0;
          padding: 0;
        }
        .container {
          font-family: 'Verdana', 'Arial', sans-serif;      
          max-width: 600px;
          margin: 40px auto;
          background-color: #ffffff;
          padding: 40px;
          border-radius: 10px;
          box-shadow: 0 8px 30px rgba(0, 0, 0, 0.1);
        }
        h1 {
          text-align: center;
          color: #8A53FE;
          font-size: 26px;
          font-weight: bold;
          margin-bottom: 20px;
        }
        p {
          color: #555555;
          line-height: 1.8;
          font-size: 16px;
          margin-bottom: 20px;
        }
        .logo {
          text-align: center;
        }
        .logo-img {
          max-width: 100%;
          margin-bottom: 20px;
        }
        .code {
          text-align: center;
          background-color: #e8f0fe;
          padding: 14px 24px;
          font-size: 20px;
          font-weight: bold;
          color: #8A53FE;
          border-radius: 6px;
          letter-spacing: 2px;
          margin: 20px 0;
        }
        .footer {
          margin-top: 30px;
          font-size: 13px;
          color: #9e9e9e;
          text-align: center;
        }
        .footer p {
          margin: 5px 0;
        }
        a {
          color: #8A53FE;
          text-decoration: none;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo">
          <img src="${
            process.env.EMAIL_TEMP_IMAGE
          }" alt="Logo" class="logo-img" />
        </div>
        <h1>Email Verification Code</h1>
        <p>Hello, ${data.name}</p>
        <p>
         Please use the code below to proceed with verify your email:
        </p>
        <div class="code">${data.verificationCode}</div>
        <p>
          This code will be valid for the next <strong>${
            data.verificationCodeExpire
          } minutes</strong> and can only be used once.
         
        </p>
        <p>
          If you did not request the code, please disregard this email or contact support.
        </p>
        <p>Thank you,<br>The CouchConnect Team</p>
      </div>
      <div class="footer">
        <p>&copy; ${new Date().getFullYear()} CouchConnect - All Rights Reserved.</p>
        <p>
          <a href="https://couchconnect.com/privacy">Privacy Policy</a> |
          <a href="https://couchconnect.com/contact">Contact Support</a>
        </p>
      </div>
    </body>
  </html>
`;

export default emailVerificationTemplate
