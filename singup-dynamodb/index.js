const { DynamoDBClient, GetItemCommand, PutItemCommand } = require("@aws-sdk/client-dynamodb");
const bcrypt = require("bcryptjs");

const dynamoDbClient = new DynamoDBClient({ region: "us-west-1" }); // Replace with your AWS region

exports.handler = async (event) => {
  console.log(event);
   const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS", // Allow specific methods
    "Access-Control-Allow-Headers": "Content-Type, Authorization", // Allow specific headers
  };

  const { email, password } = JSON.parse(event.body);

  if (!email || !password) {
    return {
      statusCode: 400,
     // headers: corsHeaders,
      body: JSON.stringify({ message: "Email and password are required" }),
    };
  }

  // Check if the email already exists in the database
  const getParams = {
    TableName: "Users", // Replace with your DynamoDB table name
    Key: {
      email: { S: email },
    },
  };

  try {
    const getCommand = new GetItemCommand(getParams);
    const getResult = await dynamoDbClient.send(getCommand);

    if (getResult.Item) {
      // Email already exists
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ message: "Email already exists" }),
      };
    }

    // Hash the password
    const saltRounds = 10; // Adjust the salt rounds as necessary (higher value = more secure but slower)
    const hashedPassword = bcrypt.hashSync(password, saltRounds);

    // Add the new user to the database
const putParams = {
  TableName: "Users", // Replace with your DynamoDB table name
  Item: {
    email: { S: email },
    password: { S: hashedPassword }, // Store the hashed password
    createdAt: { S: new Date().toISOString() }, // ISO string for createdAt
    updatedAt: { S: new Date().toISOString() }, // ISO string for updatedAt
  },
};


    const putCommand = new PutItemCommand(putParams);
    await dynamoDbClient.send(putCommand);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ message: "User created successfully" }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ message: "Internal Server Error", error: error.message }),
    };
  }
};
