const { DynamoDBClient, ScanCommand } = require("@aws-sdk/client-dynamodb");
const jwt = require("jsonwebtoken");

// Initialize the DynamoDB client with the default region
const dynamoDbClient = new DynamoDBClient({ region: "us-west-1" });

// Replace with your actual JWT secret key
const JWT_SECRET = "your_jwt_secret_key";

// DynamoDB table name
const FILES_TABLE = "Files"; // Replace with your DynamoDB table name

exports.handler = async (event) => {
  try {
    console.log(event);

    // Extract the token from the Authorization header
    const authHeader = event.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return {
        statusCode: 401,
        body: JSON.stringify({ message: "Unauthorized: No token provided" }),
      };
    }
    const token = authHeader.split(" ")[1]; // Extract token without "Bearer "

    // Verify the JWT token
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (error) {
      return {
        statusCode: 401,
        body: JSON.stringify({ message: "Unauthorized: Invalid token", error: error.message }),
      };
    }

    // Extract email from the decoded JWT payload
    const userEmail = decoded.email;
    if (!userEmail) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Invalid token payload: Email missing" }),
      };
    }

    // Scan DynamoDB for files associated with the userEmail
    const params = {
      TableName: FILES_TABLE,
      FilterExpression: 'userEmail = :userEmail',
      ExpressionAttributeValues: {
        ':userEmail': { S: userEmail },
      },
    };

    const command = new ScanCommand(params);
    const result = await dynamoDbClient.send(command);

    // Filter out sound files (e.g., .mp3, .wav, .ogg)
    const nonSoundFiles = result.Items.filter(item => {
      const fileUrl = item.fileUrl.S;
      // Skip files with sound extensions
      return !(
        fileUrl.endsWith(".mp3") ||
        fileUrl.endsWith(".wav") ||
        fileUrl.endsWith(".ogg")
      );
    });

    if (nonSoundFiles.length === 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: "No non-sound files found" }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ files: nonSoundFiles }),
    };
  } catch (err) {
    console.log("Unexpected Error: ", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Internal Server Error", error: err.message }),
    };
  }
};
