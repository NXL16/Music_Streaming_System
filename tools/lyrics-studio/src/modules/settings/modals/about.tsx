import { BUILD_TIME, GIT_COMMIT } from "virtual:buildmeta";
import { Card, Flex, Heading, Text } from "@radix-ui/themes";

export const SettingsAboutTab = () => {
	return (
		<Flex direction="column" gap="4">
			<Flex direction="column" gap="1">
				<Heading size="4">
					404Hz Lyrics Studio
				</Heading>
				<Text as="div" size="2" color="gray">
					Trình biên tập lời bài hát TTML đồng bộ từng từ cho 404Hz.
				</Text>
			</Flex>

			<Card>
				<Flex direction="column" gap="2">
					<Flex direction="column" gap="1">
						<Text as="div" size="2">
							Build: {BUILD_TIME}
						</Text>
						<Text as="div" size="2">
							Revision: {GIT_COMMIT}
						</Text>
					</Flex>
				</Flex>
			</Card>
		</Flex>
	);
};
