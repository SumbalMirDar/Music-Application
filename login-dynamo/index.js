const { DynamoDBClient, GetItemCommand } = require("@aws-sdk/client-dynamodb");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const dynamoDbClient = new DynamoDBClient({ region: "us-west-1" }); // Replace with your region
const JWT_SECRET = "your_jwt_secret_key"; // Replace with a strong secret key

exports.handler = async (event) => {
  try {
    const { email, password } = JSON.parse(event.body);

    if (!email || !password) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Email and password are required" }),
      };
    }

    // Fetch user from DynamoDB
    const params = {
      TableName: "Users", // Replace with your DynamoDB table name
      Key: {
        email: { S: email },
      },
    };

    const command = new GetItemCommand(params);
    const data = await dynamoDbClient.send(command);

    if (!data.Item) {
      return {
        statusCode: 401,
        body: JSON.stringify({ message: "Invalid email or password" }),
      };
    }

    // Retrieve the hashed password from DynamoDB
    const storedHashedPassword = data.Item.password.S;

    // Compare the provided password with the hashed password using bcryptjs
    const passwordMatch = await bcrypt.compare(password, storedHashedPassword);

    if (!passwordMatch) {
      return {
        statusCode: 401,
        body: JSON.stringify({ message: "Invalid email or password" }),
      };
    }

    // Generate JWT token
    const token = jwt.sign({ email: email }, JWT_SECRET, { expiresIn: "1h" });

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Authentication successful", token: token }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Internal Server Error", error: error.message }),
    };
  }
};
