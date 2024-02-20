# AWS S3 Audio Transcription with OpenAI and Lambda

Hey everyone!

I want to share a solution for a simple case. Imagine you upload an audio file to your S3 bucket, and in just a short while, you get its text transcription!

The solution is quite simple – a Lambda function that responds to events of adding audio files to your bucket.

How does it work? After the file is uploaded, it is processed, and as soon as the result is ready, a text file with the transcription will appear next to the audio file in your bucket.

![Poster.png](images%2FPoster.png)

## Getting Started

1. **Register an OpenAI API Key**

   First, you need to sign up at [openai.com](https://openai.com) and get your API key. Save this key in AWS Secrets Manager as shown below:

![SecretsManager.jpg](images%2FSecretsManager.jpg) 

   You can name the key whatever you like, but remember the **Secret name** as it will be important later:

![SecretsManager2.jpg](images%2FSecretsManager2.jpg)

2. **Setting Up Your S3 Bucket**

   Assuming you already have an S3 Bucket in AWS. Let's move on to creating the function. Navigate to the Lambda functions section and create a new one.

   **Important Function Settings:**

    - **Memory:** I allocated 512MB because, in my case, I upload files around 20MB each. They obviously consume more resources.

    - **Timeout:** For the same reason, I set it to 3 minutes.

    - **Runtime:** Node.js 20.x, because the code is written for Node.js. This ensures compatibility and optimal performance for the Lambda function.


3. **Adding Necessary Permissions**

   Now, you need to add the necessary permissions for your Bucket (read and write permissions) and for the Secrets Manager, so the function can retrieve the key. Optionally I'm also setting permissions for CloudWatch.


![Permissions.jpg](images%2FPermissions.jpg)

   It's important to only give the function the permissions it needs, especially concerning the Secrets Manager. Ensure access is granted only to the specific key:

![PermissionsSecrets.jpg](images%2FPermissionsSecrets.jpg)

4. **Setting Environment Variables**

   You also need to specify environment variables. This links to the key from AWS Secrets Manager. Remember I mentioned the importance of the key name? This is where it comes into play. Key should be **openai_key**

![EnvironmentVariable.jpg](images%2FEnvironmentVariable.jpg)

5. **Inserting the Function Code**

   Now, simply insert the function code from this repository [index.mjs](index.mjs) (and deploy it):

![Code.jpg](images%2FCode.jpg)

6. **Enjoy the Results ;)**

![Result.jpg](images%2FResult.jpg)
