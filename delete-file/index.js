const { DynamoDBClient, ScanCommand, DeleteItemCommand } = require("@aws-sdk/client-dynamodb");
const { S3Client, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const jwt = require("jsonwebtoken");

// Initialize the DynamoDB and S3 clients
const dynamoDbClient = new DynamoDBClient({ region: "us-west-1" });
const s3Client = new S3Client({ region: "us-west-1" });
const JWT_SECRET = "your_jwt_secret_key"; // Ensure you define this securely in environment variables

// DynamoDB table name and S3 bucket names
const FILES_TABLE = "Files"; // Replace with your DynamoDB table name
const SOURCE_BUCKET = "plt-bucket-sumbal"; // Replace with your source bucket name
const DESTINATION_BUCKET = "west-region-sumbal"; // Replace with your destination bucket name

exports.handler = async (event) => {
  // Handle preflight OPTIONS requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*", // Set to your domain for production
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization"
      },
      body: ''
    };
  }

  try {
    console.log("Event:", JSON.stringify(event, null, 2));

    // Extract the token from the Authorization header
    const authHeader = event.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return {
        statusCode: 401,
        headers: {
          "Access-Control-Allow-Origin": "*", // Set to your domain for production
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization"
        },
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
        headers: {
          "Access-Control-Allow-Origin": "*", // Set to your domain for production
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization"
        },
        body: JSON.stringify({ message: "Unauthorized: Invalid token", error: error.message }),
      };
    }

    // Extract email from the decoded JWT payload
    const userEmail = decoded.email;
    if (!userEmail) {
      return {
        statusCode: 400,
        headers: {
          "Access-Control-Allow-Origin": "*", // Set to your domain for production
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization"
        },
        body: JSON.stringify({ message: "Invalid token payload: Email missing" }),
      };
    }

    // Parse the fileUrl from the request body
    const body = JSON.parse(event.body);
    const fileUrl = body.fileUrl;
    if (!fileUrl) {
      return {
        statusCode: 400,
        headers: {
          "Access-Control-Allow-Origin": "*", // Set to your domain for production
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization"
        },
        body: JSON.stringify({ message: "fileUrl is required in the request body" }),
      };
    }

    // Extract fileKey from the fileUrl
    const fileKey = fileUrl.split('/').pop(); // Assuming fileUrl ends with the file name

    // Log the fileUrl and fileKey to verify
    console.log("File URL:", fileUrl);
    console.log("File Key:", fileKey);

    // Scan DynamoDB for the item with the matching userEmail and fileName
    const scanParams = {
      TableName: FILES_TABLE,
      FilterExpression: 'userEmail = :userEmail AND fileName = :fileName',
      ExpressionAttributeValues: {
        ':userEmail': { S: userEmail },
        ':fileName': { S: fileKey },
      },
    };

    const scanCommand = new ScanCommand(scanParams);
    const scanResult = await dynamoDbClient.send(scanCommand);

    // Log the scan result to troubleshoot
    console.log("Scan result:", JSON.stringify(scanResult, null, 2));

    if (scanResult.Count === 0) {
      return {
        statusCode: 404,
        headers: {
          "Access-Control-Allow-Origin": "*", // Set to your domain for production
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization"
        },
        body: JSON.stringify({ message: "File record not found" }),
      };
    }

    // Assuming the first item in the result is the one to delete
    const item = scanResult.Items[0];
    const id = item.id.N; // Correctly accessing the numeric ID

    // Log the ID being used for deletion
    console.log("Deleting item with ID:", id);

    // Delete the item from DynamoDB using the primary key
    const deleteParams = {
      TableName: FILES_TABLE,
      Key: {
        id: { N: id },
      },
    };
    const deleteItemCommand = new DeleteItemCommand(deleteParams);
    await dynamoDbClient.send(deleteItemCommand);

    // Delete the file from S3 (source bucket)
    const deleteSourceParams = {
      Bucket: SOURCE_BUCKET,
      Key: fileKey,
    };
    await s3Client.send(new DeleteObjectCommand(deleteSourceParams));

    // Delete the file from the destination bucket
    const deleteDestinationParams = {
      Bucket: DESTINATION_BUCKET,
      Key: fileKey,
    };
    await s3Client.send(new DeleteObjectCommand(deleteDestinationParams));

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*", // Set to your domain for production
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization"
      },
      body: JSON.stringify({ message: "File deleted successfully" }),
    };
  } catch (err) {
    console.log("Unexpected Error: ", err);
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*", // Set to your domain for production
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization"
      },
      body: JSON.stringify({ message: "Internal Server Error", error: err.message }),
    };
  }
};
